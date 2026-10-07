import { collections, type RateLimitDocument } from "@/lib/database/collections";
import { createHash } from "node:crypto";
import type { Db } from "mongodb";

export type RateLimitPolicy = {
  /** Failures allowed inside the window before the key is locked. */
  maxAttempts: number;
  windowMs: number;
  /** First lock length; each repeated lock doubles it up to maxLockMs. */
  lockMs: number;
  maxLockMs: number;
};

const minute = 60 * 1000;

export const rateLimitPolicies = {
  /** Wrong passwords for one email address, whoever sends them. */
  loginAccount: { maxAttempts: 5, windowMs: 15 * minute, lockMs: 15 * minute, maxLockMs: 24 * 60 * minute },
  /** Wrong passwords from one network address, across any emails. */
  loginIp: { maxAttempts: 20, windowMs: 15 * minute, lockMs: 15 * minute, maxLockMs: 24 * 60 * minute },
  /** Wrong authenticator or recovery codes for one account. */
  twoFactor: { maxAttempts: 5, windowMs: 15 * minute, lockMs: 15 * minute, maxLockMs: 24 * 60 * minute },
  /** Accounts created from one network address. */
  register: { maxAttempts: 10, windowMs: 60 * minute, lockMs: 60 * minute, maxLockMs: 24 * 60 * minute },
} satisfies Record<string, RateLimitPolicy>;

/** Lock history is forgotten after a quiet day so old mistakes stop escalating. */
const recordLifetimeMs = 24 * 60 * minute;

export type RateLimitStatus = {
  locked: boolean;
  retryAfterSeconds: number;
  attemptsRemaining: number;
};

function hashed(value: string) {
  return createHash("sha256").update(value).digest("base64url").slice(0, 32);
}

export const rateLimitKeys = {
  loginAccount: (email: string) => `login:account:${hashed(email.trim().toLowerCase())}`,
  loginIp: (ip: string) => `login:ip:${hashed(ip)}`,
  twoFactor: (userId: string) => `2fa:user:${userId}`,
  register: (ip: string) => `register:ip:${hashed(ip)}`,
};

/** Vercel overwrites x-forwarded-for with the real client address. */
export function clientIp(request: Request) {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

function statusOf(
  document: RateLimitDocument | null,
  policy: RateLimitPolicy,
  now: Date,
): RateLimitStatus {
  const lockedUntil = document?.lockedUntil;
  if (lockedUntil && lockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000),
      attemptsRemaining: 0,
    };
  }
  const windowOpen =
    document?.windowStartedAt &&
    document.windowStartedAt.getTime() > now.getTime() - policy.windowMs;
  const used = windowOpen ? document.failures : 0;
  return {
    locked: false,
    retryAfterSeconds: 0,
    attemptsRemaining: Math.max(policy.maxAttempts - used, 0),
  };
}

export async function getRateLimitStatus(
  db: Db,
  key: string,
  policy: RateLimitPolicy,
) {
  const document = await db
    .collection<RateLimitDocument>(collections.rateLimits)
    .findOne({ _id: key });
  return statusOf(document, policy, new Date());
}

/**
 * Counts one failed attempt atomically, so parallel guesses cannot slip past
 * the limit, and locks the key once the window's allowance is used up.
 */
export async function recordRateLimitFailure(
  db: Db,
  key: string,
  policy: RateLimitPolicy,
) {
  const now = new Date();
  const windowFloor = new Date(now.getTime() - policy.windowMs);
  const inWindow = { $gt: ["$windowStartedAt", windowFloor] };
  const reachedLimit = { $gte: ["$failures", policy.maxAttempts] };
  const document = await db
    .collection<RateLimitDocument>(collections.rateLimits)
    .findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            failures: {
              $cond: [inWindow, { $add: [{ $ifNull: ["$failures", 0] }, 1] }, 1],
            },
            windowStartedAt: { $cond: [inWindow, "$windowStartedAt", now] },
          },
        },
        {
          $set: {
            lockouts: {
              $cond: [
                reachedLimit,
                { $add: [{ $ifNull: ["$lockouts", 0] }, 1] },
                { $ifNull: ["$lockouts", 0] },
              ],
            },
          },
        },
        {
          $set: {
            lockedUntil: {
              $cond: [
                reachedLimit,
                {
                  $add: [
                    now,
                    {
                      $min: [
                        policy.maxLockMs,
                        {
                          $multiply: [
                            policy.lockMs,
                            { $pow: [2, { $subtract: ["$lockouts", 1] }] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                "$lockedUntil",
              ],
            },
            failures: { $cond: [reachedLimit, 0, "$failures"] },
            expiresAt: new Date(now.getTime() + recordLifetimeMs),
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
  return statusOf(document, policy, now);
}

export async function clearRateLimit(db: Db, key: string) {
  await db
    .collection<RateLimitDocument>(collections.rateLimits)
    .deleteOne({ _id: key });
}

export function formatRetryAfter(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
