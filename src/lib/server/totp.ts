import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 time-based one-time passwords, compatible with authenticator apps. */

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const totpPeriodSeconds = 30;
const digits = 6;

export function encodeBase32(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input: string) {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of clean) {
    const index = base32Alphabet.indexOf(character);
    if (index === -1) throw new Error("Invalid base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit secret, the size RFC 4226 recommends for HMAC-SHA1. */
export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function currentTotpStep(now = Date.now()) {
  return Math.floor(now / 1000 / totpPeriodSeconds);
}

export function generateTotp(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

/**
 * Returns the matching time step, allowing one step of clock drift either
 * way, or null. Steps at or before `afterStep` are rejected as replays.
 */
export function verifyTotp(
  secret: string,
  code: string,
  { now = Date.now(), afterStep }: { now?: number; afterStep?: number } = {},
) {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const received = Buffer.from(normalized);
  const current = currentTotpStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (afterStep !== undefined && step <= afterStep) continue;
    if (timingSafeEqual(Buffer.from(generateTotp(secret, step)), received)) {
      return step;
    }
  }
  return null;
}

export function totpUri({
  secret,
  accountName,
  issuer,
}: {
  secret: string;
  accountName: string;
  issuer: string;
}) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(digits),
    period: String(totpPeriodSeconds),
  });
  return `otpauth://totp/${label}?${query}`;
}
