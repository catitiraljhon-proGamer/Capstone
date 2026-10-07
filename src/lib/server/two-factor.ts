import { collections, type UserDocument } from "@/lib/database/collections";
import { getAuthSecret } from "@/lib/server/auth-secret";
import { encodeBase32, verifyTotp } from "@/lib/server/totp";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Db } from "mongodb";
import { z } from "zod";

export const twoFactorIssuer = "G4 Builders Inc";
export const twoFactorChallengeCookieName = "g4_2fa_challenge";
export const twoFactorChallengeCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 600,
};
const recoveryCodeCount = 8;

function encryptionKey() {
  return Buffer.from(
    hkdfSync("sha256", getAuthSecret(), "g4-two-factor", "totp-secret", 32),
  );
}

/** AES-256-GCM; output is iv.tag.ciphertext in base64url. */
export function encryptTwoFactorSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptTwoFactorSecret(value: string) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function normalizeRecoveryCode(code: string) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashRecoveryCode(code: string) {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** Codes are shown once; only their hashes are stored. */
export function generateRecoveryCodes() {
  const codes = Array.from({ length: recoveryCodeCount }, () => {
    const raw = encodeBase32(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return {
    codes,
    stored: codes.map((code) => ({ hash: hashRecoveryCode(code) })),
  };
}

export function remainingRecoveryCodes(user: UserDocument) {
  return user.twoFactor?.recoveryCodes.filter((code) => !code.usedAt).length ?? 0;
}

/**
 * Accepts a current authenticator code or an unused recovery code. Each
 * successful code is consumed with a conditional update, so the same code
 * cannot be accepted twice even by parallel requests.
 */
export async function consumeTwoFactorCode(
  db: Db,
  user: UserDocument,
  code: string,
): Promise<"authenticator" | "recovery" | null> {
  const settings = user.twoFactor;
  if (!settings) return null;
  const users = db.collection<UserDocument>(collections.users);

  const step = verifyTotp(decryptTwoFactorSecret(settings.secret), code, {
    afterStep: settings.lastUsedStep,
  });
  if (step !== null) {
    const result = await users.updateOne(
      {
        _id: user._id,
        $or: [
          { "twoFactor.lastUsedStep": { $exists: false } },
          { "twoFactor.lastUsedStep": { $lt: step } },
        ],
      },
      { $set: { "twoFactor.lastUsedStep": step } },
    );
    return result.modifiedCount === 1 ? "authenticator" : null;
  }

  const hash = hashRecoveryCode(code);
  if (!settings.recoveryCodes.some((entry) => entry.hash === hash && !entry.usedAt)) {
    return null;
  }
  const result = await users.updateOne(
    {
      _id: user._id,
      twoFactor: { $exists: true },
      "twoFactor.recoveryCodes": { $elemMatch: { hash, usedAt: { $exists: false } } },
    },
    { $set: { "twoFactor.recoveryCodes.$[code].usedAt": new Date() } },
    { arrayFilters: [{ "code.hash": hash, "code.usedAt": { $exists: false } }] },
  );
  return result.modifiedCount === 1 ? "recovery" : null;
}

const challengeSchema = z.object({
  userId: z.string().regex(/^[a-f0-9]{24}$/),
  authVersion: z.number().int().nonnegative(),
  rememberMe: z.boolean(),
  provider: z.enum(["password", "google"]),
  linkedGoogle: z.boolean(),
});
export type TwoFactorChallenge = z.infer<typeof challengeSchema>;

/** Proves the first factor passed; it is not a session and grants no access. */
export function createTwoFactorChallenge(challenge: TwoFactorChallenge) {
  return new SignJWT({ ...challengeSchema.parse(challenge) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("g4-builders")
    .setAudience("two-factor-challenge")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getAuthSecret());
}

export async function readTwoFactorChallenge(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      algorithms: ["HS256"],
      issuer: "g4-builders",
      audience: "two-factor-challenge",
      requiredClaims: ["iat", "exp"],
      maxTokenAge: "10m",
    });
    return challengeSchema.parse(payload);
  } catch {
    return null;
  }
}
