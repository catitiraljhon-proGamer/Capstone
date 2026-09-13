import { getDatabase } from "@/lib/database/mongodb";
import { recordAuditLog } from "@/lib/server/audit";
import { resolveGoogleAccount } from "@/lib/server/google-accounts";
import {
  createGoogleLink,
  exchangeGoogleCode,
  getGoogleConfig,
  GoogleAuthError,
  googleCookieOptions,
  googleFlowCookieName,
  googleLinkCookieName,
  readGoogleFlow,
} from "@/lib/server/google-oauth";
import { createSessionToken, sessionCookieName } from "@/lib/server/session";
import { roleHomePaths, type SessionUser } from "@/types/domain";
import { MongoError, MongoNetworkError, MongoServerSelectionError } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function redirectResponse(url: URL) {
  const response = NextResponse.redirect(url, {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  response.cookies.set(googleFlowCookieName, "", {
    ...googleCookieOptions,
    maxAge: 0,
  });
  response.cookies.set(googleLinkCookieName, "", {
    ...googleCookieOptions,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  let mode = "login";
  let origin = request.nextUrl.origin;
  let stage = "configuration";
  try {
    origin = getGoogleConfig().origin;
    stage = "state_verification";
    const flow = await readGoogleFlow(
      request.cookies.get(googleFlowCookieName)?.value,
      request.nextUrl.searchParams.get("state"),
    );
    mode = flow.mode;
    const providerError = request.nextUrl.searchParams.get("error");
    if (providerError)
      throw new GoogleAuthError(
        providerError === "access_denied" ? "cancelled" : "failed",
      );
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new GoogleAuthError("failed");

    stage = "token_exchange";
    const profile = await exchangeGoogleCode(code, flow);
    stage = "database";
    const db = await getDatabase();
    stage = "account";
    const { user, created, needsLink } = await resolveGoogleAccount(
      db,
      profile,
    );
    stage = "session";
    if (needsLink) {
      const response = redirectResponse(
        new URL("/login?google_link=1", origin),
      );
      response.cookies.set(
        googleLinkCookieName,
        await createGoogleLink({
          userId: user._id.toHexString(),
          googleSub: profile.sub,
          email: user.email,
          authVersion: user.authVersion ?? 0,
          rememberMe: flow.rememberMe,
        }),
        googleCookieOptions,
      );
      return response;
    }

    const sessionUser: SessionUser = {
      id: user._id.toHexString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const maxAge = flow.rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
    const token = await createSessionToken(
      { ...sessionUser, authVersion: user.authVersion ?? 0 },
      `${maxAge}s`,
    );
    stage = "audit";
    await recordAuditLog({
      db,
      actor: sessionUser,
      action: created ? "auth.registered" : "auth.login",
      entityType: created ? "user" : "session",
      ...(created ? { entityId: user._id } : {}),
      details: {
        provider: "google",
        email: user.email,
        role: user.role,
        rememberMe: flow.rememberMe,
      },
    });
    const response = redirectResponse(
      new URL(roleHomePaths[user.role], origin),
    );
    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });
    return response;
  } catch (error) {
    const code =
      error instanceof GoogleAuthError
        ? error.code
        : stage === "database" || error instanceof MongoError
          ? "database_unavailable"
          : "failed";
    if (["failed", "not_configured", "database_unavailable"].includes(code)) {
      // Log only fixed diagnostic labels, never raw errors, URLs or credentials.
      console.error("Google sign-in failed", {
        stage,
        code,
        errorType:
          error instanceof MongoServerSelectionError
            ? "MongoServerSelectionError"
            : error instanceof MongoNetworkError
              ? "MongoNetworkError"
              : error instanceof MongoError
                ? "MongoError"
                : error instanceof GoogleAuthError
                  ? "GoogleAuthError"
                  : "UnexpectedError",
      });
    }
    const url = new URL(`/${mode}`, origin);
    url.searchParams.set("google_error", code);
    return redirectResponse(url);
  }
}
