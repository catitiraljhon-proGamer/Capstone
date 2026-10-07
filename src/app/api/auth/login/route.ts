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
import {
  clearRateLimit,
  clientIp,
  formatRetryAfter,
  getRateLimitStatus,
  rateLimitKeys,
  rateLimitPolicies,
  recordRateLimitFailure,
  type RateLimitStatus,
} from "@/lib/server/rate-limit";
import { startSession, toSessionUser } from "@/lib/server/session";
import {
  createTwoFactorChallenge,
  twoFactorChallengeCookieName,
  twoFactorChallengeCookieOptions,
} from "@/lib/server/two-factor";
import { roleHomePaths } from "@/types/domain";
import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional().default(false),
  linkGoogle: z.boolean().optional().default(false),
});

/** Equalizes response time for unknown emails so they cannot be detected by timing. */
const dummyPasswordHash =
  "$2b$12$4iZXOIdk.bWb/Z/1l3Ltm.MtBxciWGO30kS8mi3vW/pkP1OGh7vli";

function lockedResponse(status: RateLimitStatus) {
  return NextResponse.json(
    {
      error: `Too many failed sign-in attempts. For your security, sign-in is locked. Try again in ${formatRetryAfter(status.retryAfterSeconds)}.`,
      retryAfterSeconds: status.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(status.retryAfterSeconds) },
    },
  );
}

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
    const accountKey = rateLimitKeys.loginAccount(input.email);
    const ipKey = rateLimitKeys.loginIp(clientIp(request));

    // Locked keys are rejected before the password is checked, so guesses
    // made during a lockout reveal nothing.
    const [accountStatus, ipStatus] = await Promise.all([
      getRateLimitStatus(db, accountKey, rateLimitPolicies.loginAccount),
      getRateLimitStatus(db, ipKey, rateLimitPolicies.loginIp),
    ]);
    if (accountStatus.locked) return lockedResponse(accountStatus);
    if (ipStatus.locked) return lockedResponse(ipStatus);

    const user = await db.collection<UserDocument>(collections.users).findOne({
      email: input.email,
      status: "active",
    });
    const passwordMatches = await compare(
      input.password,
      user?.passwordHash ?? dummyPasswordHash,
    );

    if (!user?.passwordHash || !passwordMatches) {
      const [account, network] = await Promise.all([
        recordRateLimitFailure(db, accountKey, rateLimitPolicies.loginAccount),
        recordRateLimitFailure(db, ipKey, rateLimitPolicies.loginIp),
      ]);
      if (network.locked && !account.locked) return lockedResponse(network);
      if (account.locked) {
        if (user) {
          await recordAuditLog({
            db,
            actor: toSessionUser(user),
            action: "auth.locked",
            entityType: "session",
            details: {
              reason: "Too many failed password attempts",
              lockedForSeconds: account.retryAfterSeconds,
            },
          });
        }
        return lockedResponse(account);
      }
      const warning =
        account.attemptsRemaining <= 2
          ? ` ${account.attemptsRemaining} attempt${account.attemptsRemaining === 1 ? "" : "s"} left before sign-in is locked.`
          : "";
      return NextResponse.json(
        {
          error: `The email or password is incorrect.${warning}`,
          attemptsRemaining: account.attemptsRemaining,
        },
        { status: 401 },
      );
    }

    await clearRateLimit(db, accountKey);

    if (input.linkGoogle) {
      const link = await readGoogleLink(
        request.cookies.get(googleLinkCookieName)?.value,
      );
      if (!link) throw new GoogleAuthError("expired");
      await linkGoogleAccount(db, user, link);
    }

    if (user.twoFactor) {
      const response = NextResponse.json({ twoFactorRequired: true });
      response.cookies.set(
        twoFactorChallengeCookieName,
        await createTwoFactorChallenge({
          userId: user._id.toHexString(),
          authVersion: user.authVersion ?? 0,
          rememberMe: input.rememberMe,
          provider: "password",
          linkedGoogle: input.linkGoogle,
        }),
        twoFactorChallengeCookieOptions,
      );
      response.cookies.set(googleLinkCookieName, "", {
        ...googleCookieOptions,
        maxAge: 0,
      });
      return response;
    }

    const sessionUser = toSessionUser(user);
    const response = NextResponse.json({
      user: sessionUser,
      redirectTo: roleHomePaths[user.role],
    });
    await startSession(response, user, input.rememberMe);
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
