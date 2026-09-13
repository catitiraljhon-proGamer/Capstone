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
  try {
    origin = getGoogleConfig().origin;
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

    const profile = await exchangeGoogleCode(code, flow);
    const db = await getDatabase();
    const { user, created, needsLink } = await resolveGoogleAccount(
      db,
      profile,
    );
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
    // Do not log authorization codes, provider tokens, cookies, or client secrets.
    const url = new URL(`/${mode}`, origin);
    url.searchParams.set(
      "google_error",
      error instanceof GoogleAuthError ? error.code : "failed",
    );
    return redirectResponse(url);
  }
}
