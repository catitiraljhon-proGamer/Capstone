import { collections, type UserDocument } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { signInDestination } from "@/lib/server/clients";
import { startSession } from "@/lib/server/session";
import {
  readTwoFactorChallenge,
  remainingRecoveryCodes,
  twoFactorChallengeCookieName,
  twoFactorChallengeCookieOptions,
} from "@/lib/server/two-factor";
import {
  checkTwoFactorCode,
  twoFactorCodeSchema,
} from "@/lib/server/two-factor-api";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function expiredResponse() {
  return NextResponse.json(
    { error: "Your sign-in step expired. Sign in again.", restart: true },
    { status: 401 },
  );
}

/** Second sign-in step: exchanges a valid challenge and code for a session. */
export async function POST(request: NextRequest) {
  try {
    const { code } = twoFactorCodeSchema.parse(await request.json());
    const challenge = await readTwoFactorChallenge(
      request.cookies.get(twoFactorChallengeCookieName)?.value,
    );
    if (!challenge) return expiredResponse();

    const db = await getDatabase();
    const user = await db.collection<UserDocument>(collections.users).findOne({
      _id: new ObjectId(challenge.userId),
      status: "active",
    });
    if (!user?.twoFactor || (user.authVersion ?? 0) !== challenge.authVersion) {
      return expiredResponse();
    }

    const check = await checkTwoFactorCode(db, user, code);
    if (check.error) return check.error;

    const response = NextResponse.json({ redirectTo: signInDestination(user) });
    const sessionUser = await startSession(response, user, challenge.rememberMe);
    response.cookies.set(twoFactorChallengeCookieName, "", {
      ...twoFactorChallengeCookieOptions,
      maxAge: 0,
    });
    await recordAuditLog({
      db,
      actor: sessionUser,
      action: "auth.login",
      entityType: "session",
      details: {
        rememberMe: challenge.rememberMe,
        twoFactor: check.method,
        ...(challenge.provider === "google" || challenge.linkedGoogle
          ? { provider: "google" }
          : {}),
        ...(challenge.linkedGoogle ? { linkedGoogle: true } : {}),
        ...(check.method === "recovery"
          ? { recoveryCodesRemaining: remainingRecoveryCodes(user) - 1 }
          : {}),
      },
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
