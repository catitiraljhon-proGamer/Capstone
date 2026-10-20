import { collections, type UserDocument } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import {
  googleSignInReminderEmail,
  isEmailConfigured,
  passwordResetEmail,
  sendEmail,
  type EmailMessage,
} from "@/lib/server/email";
import {
  createPasswordResetToken,
  passwordResetMinutes,
  passwordResetRequestSchema,
} from "@/lib/server/password-reset";
import {
  clientIp,
  formatRetryAfter,
  getRateLimitStatus,
  rateLimitKeys,
  rateLimitPolicies,
  recordRateLimitFailure,
} from "@/lib/server/rate-limit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** The same answer for every address, so this form cannot reveal who has an account. */
const sentResponse = {
  sent: true,
  message: "If an account exists for this email, we sent a message with the next steps. Check your Gmail inbox and spam folder.",
};

export async function POST(request: Request) {
  try {
    const { email } = passwordResetRequestSchema.parse(await request.json());
    if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Password reset is not available right now. Please try again later." },
        { status: 503 },
      );
    }
    const db = await getDatabase();
    const limits = [
      [rateLimitKeys.passwordResetIp(clientIp(request)), rateLimitPolicies.passwordResetIp],
      [rateLimitKeys.passwordResetAddress(email), rateLimitPolicies.passwordResetAddress],
    ] as const;
    for (const [key, policy] of limits) {
      const limit = await getRateLimitStatus(db, key, policy);
      if (limit.locked) {
        return NextResponse.json(
          { error: `Too many reset requests were made. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.` },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
        );
      }
    }
    for (const [key, policy] of limits) await recordRateLimitFailure(db, key, policy);

    const user = await db
      .collection<UserDocument>(collections.users)
      .findOne({ email, status: "active" });
    let message: EmailMessage | null = null;
    if (user?.passwordHash) {
      message = passwordResetEmail(user.email, user.name, await createPasswordResetToken(user), passwordResetMinutes);
    } else if (user?.googleSub) {
      message = googleSignInReminderEmail(user.email, user.name);
    }

    if (message) {
      if (isEmailConfigured()) {
        try {
          await sendEmail(message);
        } catch (error) {
          // Log only a fixed label; SMTP errors can echo addresses and credentials.
          console.error("Password reset email failed", {
            errorType: error instanceof Error ? error.name : "UnknownError",
          });
        }
      } else {
        // Local development without Gmail settings: read the link from the server log.
        console.info(`[dev] Password reset email for ${email}:\n${message.text}`);
      }
    }

    return NextResponse.json(sentResponse);
  } catch (error) {
    return apiError(error);
  }
}
