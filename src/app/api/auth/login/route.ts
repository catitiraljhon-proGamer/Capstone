import { collections, type UserDocument } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { linkGoogleAccount } from "@/lib/server/google-accounts";
import {
  getGoogleConfig,
  GoogleAuthError,
  googleCookieOptions,
  googleLinkCookieName,
  readGoogleLink,
} from "@/lib/server/google-oauth";
import { googleAuthErrorMessage } from "@/lib/google-auth-errors";
import { createSessionToken, sessionCookieName } from "@/lib/server/session";
import { roleHomePaths, type SessionUser } from "@/types/domain";
import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional().default(false),
  linkGoogle: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const input = loginSchema.parse(await request.json());
    if (
      input.linkGoogle &&
      request.headers.get("origin") !== getGoogleConfig().origin
    ) {
      return NextResponse.json(
        { error: "Please connect Google from this website." },
        { status: 403 },
      );
    }
    const db = await getDatabase();
    const user = await db.collection<UserDocument>(collections.users).findOne({
      email: input.email,
      status: "active",
    });

    if (
      !user?.passwordHash ||
      !(await compare(input.password, user.passwordHash))
    ) {
      return NextResponse.json(
        { error: "The email or password is incorrect." },
        { status: 401 },
      );
    }

    if (input.linkGoogle) {
      const link = await readGoogleLink(
        request.cookies.get(googleLinkCookieName)?.value,
      );
      if (!link) throw new GoogleAuthError("expired");
      await linkGoogleAccount(db, user, link);
    }

    const sessionUser: SessionUser = {
      id: user._id.toHexString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const maxAge = input.rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
    const token = await createSessionToken(
      { ...sessionUser, authVersion: user.authVersion ?? 0 },
      `${maxAge}s`,
    );
    await recordAuditLog({
      db,
      actor: sessionUser,
      action: "auth.login",
      entityType: "session",
      details: {
        rememberMe: input.rememberMe,
        ...(input.linkGoogle ? { provider: "google", linkedGoogle: true } : {}),
      },
    });
    const response = NextResponse.json({
      user: sessionUser,
      redirectTo: roleHomePaths[user.role],
    });

    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });
    response.cookies.set(googleLinkCookieName, "", {
      ...googleCookieOptions,
      maxAge: 0,
    });

    return response;
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return NextResponse.json(
        { error: googleAuthErrorMessage(error.code) },
        { status: 401 },
      );
    }
    return apiError(error);
  }
}
