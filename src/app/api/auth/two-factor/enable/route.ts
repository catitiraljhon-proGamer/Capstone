import { collections, type UserDocument } from "@/lib/database/collections";
import { apiError, unauthorized } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import {
  getRateLimitStatus,
  rateLimitKeys,
  rateLimitPolicies,
  recordRateLimitFailure,
} from "@/lib/server/rate-limit";
import { clearSessionCookie } from "@/lib/server/session";
import { verifyTotp } from "@/lib/server/totp";
import {
  decryptTwoFactorSecret,
  generateRecoveryCodes,
} from "@/lib/server/two-factor";
import {
  requireAccountUser,
  twoFactorCodeSchema,
  twoFactorLockedResponse,
} from "@/lib/server/two-factor-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const setupLifetimeMs = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const account = await requireAccountUser();
    if (!account) return unauthorized();
    const { db, user, session } = account;
    const { code } = twoFactorCodeSchema.parse(await request.json());

    if (user.twoFactor) {
      return NextResponse.json(
        { error: "Two-factor authentication is already on." },
        { status: 409 },
      );
    }
    const setup = user.twoFactorSetup;
    if (!setup || Date.now() - setup.createdAt.getTime() > setupLifetimeMs) {
      return NextResponse.json(
        { error: "The setup expired. Start again to get a new QR code." },
        { status: 410 },
      );
    }

    const key = rateLimitKeys.twoFactor(user._id.toHexString());
    const limit = await getRateLimitStatus(db, key, rateLimitPolicies.twoFactor);
    if (limit.locked) return twoFactorLockedResponse(limit.retryAfterSeconds);

    const step = verifyTotp(decryptTwoFactorSecret(setup.secret), code);
    if (step === null) {
      const failure = await recordRateLimitFailure(db, key, rateLimitPolicies.twoFactor);
      if (failure.locked) return twoFactorLockedResponse(failure.retryAfterSeconds);
      return NextResponse.json(
        {
          error:
            "That code did not match. Check that your phone's time is set automatically and enter the newest code.",
        },
        { status: 400 },
      );
    }

    const { codes, stored } = generateRecoveryCodes();
    const twoFactor = {
      secret: setup.secret,
      enabledAt: new Date(),
      lastUsedStep: step,
      recoveryCodes: stored,
    };
    const result = await db.collection<UserDocument>(collections.users).updateOne(
      {
        _id: user._id,
        twoFactor: { $exists: false },
        "twoFactorSetup.secret": setup.secret,
      },
      {
        $set: { twoFactor, updatedAt: new Date() },
        // Signs out every session, so the next sign-in proves the new factor.
        $inc: { authVersion: 1 },
        $unset: { twoFactorSetup: "" },
      },
    );
    if (result.modifiedCount !== 1) {
      return NextResponse.json(
        { error: "The setup changed. Start again to get a new QR code." },
        { status: 409 },
      );
    }
    await recordAuditLog({
      db,
      actor: session,
      action: "auth.two-factor-enabled",
      entityType: "user",
      entityId: user._id,
    });
    const response = NextResponse.json(
      { recoveryCodes: codes },
      { headers: { "Cache-Control": "no-store" } },
    );
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
