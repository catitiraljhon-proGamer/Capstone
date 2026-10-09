import { collections, type UserDocument } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import {
  formatRetryAfter,
  getRateLimitStatus,
  rateLimitKeys,
  rateLimitPolicies,
  recordRateLimitFailure,
  clearRateLimit,
} from "@/lib/server/rate-limit";
import { requireSession } from "@/lib/server/session";
import { consumeTwoFactorCode } from "@/lib/server/two-factor";
import { ObjectId, type Db } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

export const twoFactorCodeSchema = z.object({
  code: z.string().trim().min(6).max(20),
});

/** Loads the signed-in user's full record for account security changes. */
export async function requireAccountUser() {
  const session = await requireSession(undefined, { allowWithoutTwoFactor: true });
  if (!session) return null;
  const db = await getDatabase();
  const user = await db
    .collection<UserDocument>(collections.users)
    .findOne({ _id: new ObjectId(session.id), status: "active" });
  return user ? { db, user, session } : null;
}

export function twoFactorLockedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: `Too many incorrect codes. Try again in ${formatRetryAfter(retryAfterSeconds)}.`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/**
 * Checks a 2FA or recovery code under the per-account attempt limit.
 * Returns the accepted method, or a ready error response.
 */
export async function checkTwoFactorCode(db: Db, user: UserDocument, code: string) {
  const key = rateLimitKeys.twoFactor(user._id.toHexString());
  const status = await getRateLimitStatus(db, key, rateLimitPolicies.twoFactor);
  if (status.locked) {
    return { error: twoFactorLockedResponse(status.retryAfterSeconds) };
  }
  const method = await consumeTwoFactorCode(db, user, code);
  if (!method) {
    const failure = await recordRateLimitFailure(db, key, rateLimitPolicies.twoFactor);
    if (failure.locked) {
      return { error: twoFactorLockedResponse(failure.retryAfterSeconds) };
    }
    return {
      error: NextResponse.json(
        {
          error: `That code is not valid. ${failure.attemptsRemaining} attempt${failure.attemptsRemaining === 1 ? "" : "s"} left.`,
        },
        { status: 401 },
      ),
    };
  }
  await clearRateLimit(db, key);
  return { method };
}
