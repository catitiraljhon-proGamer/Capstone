import type { UserDocument } from "@/lib/database/collections";
import { getAuthSecret } from "@/lib/server/auth-secret";
import { jwtVerify, SignJWT } from "jose";
import { createHmac } from "node:crypto";
import { z } from "zod";

/** How long the emailed reset link stays valid. */
export const passwordResetMinutes = 30;

const purpose = "password-reset";

export const passwordResetRequestSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, "This reset link is invalid.").max(2000),
  password: z
    .string()
    .min(8, "Your password must contain at least 8 characters.")
    .max(72, "Your password must contain 72 characters or fewer."),
});

/**
 * Ties a link to the password it replaces: once the password changes (or every
 * session is signed out), the fingerprint no longer matches and the link stops working.
 */
function passwordFingerprint(user: Pick<UserDocument, "passwordHash" | "authVersion">) {
  return createHmac("sha256", getAuthSecret())
    .update(`${purpose}:${user.passwordHash ?? ""}:${user.authVersion ?? 0}`)
    .digest("base64url")
    .slice(0, 22);
}

export async function createPasswordResetToken(user: UserDocument) {
  return new SignJWT({ purpose, fp: passwordFingerprint(user) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user._id.toHexString())
    .setIssuedAt()
    .setExpirationTime(`${passwordResetMinutes}m`)
    .sign(getAuthSecret());
}

/** The user id inside a well-formed, unexpired reset token, or null. */
export async function readPasswordResetToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ["HS256"] });
    if (payload.purpose !== purpose || !payload.sub || typeof payload.fp !== "string") return null;
    return { userId: payload.sub, fingerprint: payload.fp };
  } catch {
    return null;
  }
}

export function resetTokenMatches(user: UserDocument, fingerprint: string) {
  return Boolean(user.passwordHash) && passwordFingerprint(user) === fingerprint;
}
