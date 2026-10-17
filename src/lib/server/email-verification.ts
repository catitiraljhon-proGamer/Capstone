import { collections, type EmailVerificationDocument } from "@/lib/database/collections";
import { gmailAddressMessage, isGmailAddress } from "@/lib/gmail";
import { termsVersionSchema } from "@/lib/server/account-terms";
import { getAuthSecret } from "@/lib/server/auth-secret";
import { createClientSchema } from "@/lib/server/clients";
import { getSystemSettings } from "@/lib/server/maintenance";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { type Db, MongoServerError } from "mongodb";
import { z } from "zod";


/** Self-registration email: a valid, normalized Gmail address. */
export const registrationEmailSchema = createClientSchema.shape.email.refine(isGmailAddress, gmailAddressMessage);

/** Everything a self-registration needs except the emailed code; checked before the code is sent and again on sign-up. */
export const registrationDetailsSchema = createClientSchema.extend({
  email: registrationEmailSchema,
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(100, "Your name must be 100 characters or fewer."),
  password: z
    .string()
    .min(8, "Your password must contain at least 8 characters.")
    .max(72, "Your password must contain 72 characters or fewer."),
  termsVersion: termsVersionSchema,
});

export class EmailVerificationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function hashCode(email: string, code: string) {
  return createHmac("sha256", getAuthSecret())
    .update(`email-verification:${email}:${code}`)
    .digest("base64url");
}

function verifications(db: Db) {
  return db.collection<EmailVerificationDocument>(collections.emailVerifications);
}

/**
 * Creates a new 6-digit code for the email, replacing any earlier one.
 * Refuses a new code until the resend cooldown has passed. Timings come from the Admin's settings.
 */
export async function issueEmailVerificationCode(db: Db, email: string) {
  const { signupCodeMinutes, signupResendSeconds } = await getSystemSettings(db);
  const now = new Date();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const cooldownStart = new Date(now.getTime() - signupResendSeconds * 1000);
  try {
    // Matches only a code old enough to replace; a recent one makes the upsert collide on _id.
    await verifications(db).updateOne(
      { _id: email, sentAt: { $lte: cooldownStart } },
      {
        $set: {
          codeHash: hashCode(email, code),
          attempts: 0,
          sentAt: now,
          expiresAt: new Date(now.getTime() + signupCodeMinutes * 60 * 1000),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
    const recent = await verifications(db).findOne({ _id: email });
    const retryAfterSeconds = recent
      ? Math.max(1, Math.ceil((recent.sentAt.getTime() - cooldownStart.getTime()) / 1000))
      : signupResendSeconds;
    throw new EmailVerificationError(
      `A code was just sent. You can request another one in ${retryAfterSeconds} seconds.`,
      429,
      retryAfterSeconds,
    );
  }
  return code;
}

/** Throws unless the code matches the latest unexpired code for this email. */
export async function checkEmailVerificationCode(db: Db, email: string, code: string) {
  const { signupMaxAttempts: maxCodeAttempts } = await getSystemSettings(db);
  const record = await verifications(db).findOneAndUpdate(
    { _id: email, expiresAt: { $gt: new Date() }, attempts: { $lt: maxCodeAttempts } },
    { $inc: { attempts: 1 } },
    { returnDocument: "before" },
  );
  if (!record) {
    throw new EmailVerificationError(
      "Your verification code has expired or was entered incorrectly too many times. Request a new code.",
      400,
    );
  }
  const expected = Buffer.from(record.codeHash);
  const received = Buffer.from(hashCode(email, code));
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    const remaining = maxCodeAttempts - record.attempts - 1;
    throw new EmailVerificationError(
      remaining > 0
        ? `The verification code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
        : "The verification code is incorrect. Request a new code.",
      400,
    );
  }
}

export async function clearEmailVerification(db: Db, email: string) {
  await verifications(db).deleteOne({ _id: email });
}
