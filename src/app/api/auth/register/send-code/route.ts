import { collections, type UserDocument } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { emailErrorDetails, isEmailConfigured, sendEmail, verificationCodeEmail } from "@/lib/server/email";
import {
  clearEmailVerification,
  EmailVerificationError,
  issueEmailVerificationCode,
  registrationDetailsSchema,
} from "@/lib/server/email-verification";
import {
  clientIp,
  formatRetryAfter,
  getRateLimitStatus,
  rateLimitKeys,
  rateLimitPolicies,
  recordRateLimitFailure,
} from "@/lib/server/rate-limit";
import { getSystemSettings, requirePasswordPolicy } from "@/lib/server/maintenance";
import { requireCurrentTerms } from "@/lib/server/account-terms";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // The whole sign-up form is checked first, so a code is sent only for details that can register.
    const { email, password, termsVersion } = registrationDetailsSchema.parse(await request.json());
    if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Email verification is not available right now. Please register with Google or try again later." },
        { status: 503 },
      );
    }
    const db = await getDatabase();
    await requireCurrentTerms(db, termsVersion);
    await requirePasswordPolicy(db, password);
    const settings = await getSystemSettings(db);
    const limits = [
      [rateLimitKeys.verificationEmailIp(clientIp(request)), rateLimitPolicies.verificationEmailIp],
      [rateLimitKeys.verificationEmailAddress(email), rateLimitPolicies.verificationEmailAddress],
    ] as const;
    for (const [key, policy] of limits) {
      const limit = await getRateLimitStatus(db, key, policy);
      if (limit.locked) {
        return NextResponse.json(
          { error: `Too many verification codes were requested. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.` },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
        );
      }
    }

    const existingUser = await db
      .collection<UserDocument>(collections.users)
      .findOne({ email }, { projection: { _id: 1 } });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email address already exists. Sign in instead." },
        { status: 409 },
      );
    }

    const code = await issueEmailVerificationCode(db, email);
    for (const [key, policy] of limits) await recordRateLimitFailure(db, key, policy);

    if (isEmailConfigured()) {
      try {
        await sendEmail(verificationCodeEmail(email, code, settings.signupCodeMinutes));
      } catch (error) {
        await clearEmailVerification(db, email);
        // Log only fixed labels; SMTP errors can echo addresses and credentials.
        console.error("Verification email failed", emailErrorDetails(error));
        return NextResponse.json(
          { error: "We could not send a code to this email address. Check it and try again." },
          { status: 502 },
        );
      }
    } else {
      // Local development without Gmail settings: read the code from the server log.
      console.info(`[dev] Verification code for ${email}: ${code}`);
    }

    return NextResponse.json({
      sent: true,
      expiresInMinutes: settings.signupCodeMinutes,
      resendAfterSeconds: settings.signupResendSeconds,
    });
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      return NextResponse.json(
        { error: error.message, retryAfterSeconds: error.retryAfterSeconds },
        {
          status: error.status,
          ...(error.retryAfterSeconds ? { headers: { "Retry-After": String(error.retryAfterSeconds) } } : {}),
        },
      );
    }
    return apiError(error);
  }
}
