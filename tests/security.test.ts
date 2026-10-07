import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { hash } from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { type Db, ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import {
  type RateLimitDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { sessionCookieName } from "@/lib/server/session";
import {
  currentTotpStep,
  decodeBase32,
  encodeBase32,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
} from "@/lib/server/totp";
import {
  consumeTwoFactorCode,
  createTwoFactorChallenge,
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  generateRecoveryCodes,
  twoFactorChallengeCookieName,
} from "@/lib/server/two-factor";
import { finishedDesignsTerms } from "@/lib/finished-designs-terms";
import {
  acceptFinishedDesignsTerms,
  canViewFullDesignImages,
  hasAcceptedFinishedDesignsTerms,
} from "@/lib/server/finished-designs-terms";
import { POST as passwordLogin } from "@/app/api/auth/login/route";
import { POST as verifyTwoFactor } from "@/app/api/auth/two-factor/verify/route";

const origin = "http://localhost:3000";
const password = "Correct-password-123";
let mongo: MongoMemoryServer;
let db: Db;
let passwordHash: string;

before(async () => {
  process.env.AUTH_SECRET = "test-only-auth-secret-that-is-long-enough-for-hmac";
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "security_tests";
  db = await getDatabase();
  passwordHash = await hash(password, 4);
});

beforeEach(async () => {
  // Only the isolated in-memory test database is modified.
  await Promise.all(
    ["users", "audit_logs", "rate_limits"].map((name) =>
      db.collection(name).deleteMany({}),
    ),
  );
});

after(async () => {
  const cache = globalThis as typeof globalThis & {
    mongoClientPromise?: Promise<{ close(): Promise<void> }>;
  };
  await (await cache.mongoClientPromise)?.close();
  await mongo?.stop();
});

async function insertUser(overrides: Partial<UserDocument> = {}) {
  const user: UserDocument = {
    _id: new ObjectId(),
    name: "Site Engineer",
    email: "engineer@example.com",
    passwordHash,
    role: "billing-clerk",
    status: "active",
    authVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await db.collection<UserDocument>("users").insertOne(user);
  return user;
}

function login(email: string, attempt: string, ip = "203.0.113.10") {
  return passwordLogin(
    new NextRequest(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin,
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ email, password: attempt }),
    }),
  );
}

function verify(code: string, challengeCookie: string) {
  return verifyTwoFactor(
    new NextRequest(`${origin}/api/auth/two-factor/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${twoFactorChallengeCookieName}=${challengeCookie}`,
      },
      body: JSON.stringify({ code }),
    }),
  );
}

test("TOTP matches the RFC 6238 SHA-1 reference values", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  assert.equal(secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(decodeBase32(secret), Buffer.from("12345678901234567890"));
  // RFC values are 8 digits; authenticator apps show the last 6.
  assert.equal(generateTotp(secret, currentTotpStep(59 * 1000)), "287082");
  assert.equal(generateTotp(secret, currentTotpStep(1111111109 * 1000)), "081804");
  assert.equal(generateTotp(secret, currentTotpStep(2000000000 * 1000)), "279037");
});

test("TOTP verification allows one step of clock drift and rejects replays", () => {
  const secret = generateTotpSecret();
  const now = Date.now();
  const step = currentTotpStep(now);
  assert.equal(verifyTotp(secret, generateTotp(secret, step), { now }), step);
  assert.equal(verifyTotp(secret, generateTotp(secret, step - 1), { now }), step - 1);
  assert.equal(verifyTotp(secret, generateTotp(secret, step + 1), { now }), step + 1);
  assert.equal(verifyTotp(secret, generateTotp(secret, step - 2), { now }), null);
  assert.equal(verifyTotp(secret, generateTotp(secret, step), { now, afterStep: step }), null);
  assert.equal(verifyTotp(secret, "12345", { now }), null);
  assert.equal(verifyTotp(secret, "abcdef", { now }), null);
});

test("authenticator secrets are encrypted and tampering is detected", () => {
  const secret = generateTotpSecret();
  const encrypted = encryptTwoFactorSecret(secret);
  assert.equal(encrypted.includes(secret), false);
  assert.notEqual(encryptTwoFactorSecret(secret), encrypted);
  assert.equal(decryptTwoFactorSecret(encrypted), secret);
  const [iv, tag, body] = encrypted.split(".");
  const flipped = `${body[0] === "A" ? "B" : "A"}${body.slice(1)}`;
  assert.throws(() => decryptTwoFactorSecret([iv, tag, flipped].join(".")));
});

test("five wrong passwords lock the account, even for the correct password", async () => {
  const user = await insertUser();
  for (const remaining of [4, 3, 2, 1]) {
    const response = await login(user.email, "wrong-password");
    assert.equal(response.status, 401);
    assert.equal((await response.json()).attemptsRemaining, remaining);
  }
  const locked = await login(user.email, "wrong-password");
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get("retry-after"), String(15 * 60));
  assert.match((await locked.json()).error, /locked/);

  const correctWhileLocked = await login(user.email, password);
  assert.equal(correctWhileLocked.status, 429);
  assert.equal(correctWhileLocked.cookies.get(sessionCookieName), undefined);
  assert.equal(
    await db.collection("audit_logs").countDocuments({ action: "auth.locked" }),
    1,
  );
});

test("unknown emails lock the same way, so lockouts do not reveal accounts", async () => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await login("nobody@example.com", "guess")).status, 401);
  }
  assert.equal((await login("nobody@example.com", "guess")).status, 429);
});

test("a successful sign-in resets the account's failed attempts", async () => {
  const user = await insertUser();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await login(user.email, "wrong-password");
  }
  assert.equal((await login(user.email, password)).status, 200);
  const next = await login(user.email, "wrong-password");
  assert.equal((await next.json()).attemptsRemaining, 4);
});

test("one network address is limited across many emails; others are unaffected", async () => {
  for (let attempt = 0; attempt < 19; attempt += 1) {
    const response = await login(`person${attempt}@example.com`, "guess", "198.51.100.7");
    assert.equal(response.status, 401);
  }
  assert.equal((await login("person99@example.com", "guess", "198.51.100.7")).status, 429);
  const user = await insertUser();
  assert.equal((await login(user.email, password, "198.51.100.7")).status, 429);
  assert.equal((await login(user.email, password, "192.0.2.44")).status, 200);
});

test("repeated lockouts double the lock time", async () => {
  const user = await insertUser();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await login(user.email, "wrong-password");
  }
  // Simulate the first lock running out.
  await db
    .collection<RateLimitDocument>("rate_limits")
    .updateMany({ _id: /^login:account:/ }, { $set: { lockedUntil: new Date(Date.now() - 1000) } });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await login(user.email, "wrong-password")).status, 401);
  }
  const second = await login(user.email, "wrong-password");
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("retry-after"), String(30 * 60));
});

test("2FA accounts get a challenge, not a session, after the password", async () => {
  const secret = generateTotpSecret();
  const user = await insertUser({
    twoFactor: {
      secret: encryptTwoFactorSecret(secret),
      enabledAt: new Date(),
      recoveryCodes: [],
    },
  });
  const response = await login(user.email, password);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { twoFactorRequired: true });
  assert.equal(response.cookies.get(sessionCookieName), undefined);
  const challenge = response.cookies.get(twoFactorChallengeCookieName)!.value;

  const wrong = await verify("000000", challenge);
  assert.equal(wrong.status, 401);
  assert.equal(wrong.cookies.get(sessionCookieName), undefined);

  const code = generateTotp(secret, currentTotpStep());
  const accepted = await verify(code, challenge);
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).redirectTo, "/billing-clerk");
  assert.ok(accepted.cookies.get(sessionCookieName)?.value);
  assert.equal(
    await db.collection("audit_logs").countDocuments({ action: "auth.login", "details.twoFactor": "authenticator" }),
    1,
  );

  // The same code cannot be used again, even with a fresh challenge.
  const replay = await verify(code, challenge);
  assert.equal(replay.status, 401);
});

test("recovery codes work exactly once", async () => {
  const { codes, stored } = generateRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  const user = await insertUser({
    twoFactor: {
      secret: encryptTwoFactorSecret(generateTotpSecret()),
      enabledAt: new Date(),
      recoveryCodes: stored,
    },
  });
  assert.equal(await consumeTwoFactorCode(db, user, codes[0].toUpperCase()), "recovery");
  const reloaded = await db.collection<UserDocument>("users").findOne({ _id: user._id });
  assert.equal(await consumeTwoFactorCode(db, reloaded!, codes[0]), null);
  assert.equal(
    reloaded!.twoFactor!.recoveryCodes.filter((code) => code.usedAt).length,
    1,
  );
});

test("wrong 2FA codes are limited and expired challenges are refused", async () => {
  const user = await insertUser({
    twoFactor: {
      secret: encryptTwoFactorSecret(generateTotpSecret()),
      enabledAt: new Date(),
      recoveryCodes: [],
    },
  });
  const challenge = await createTwoFactorChallenge({
    userId: user._id.toHexString(),
    authVersion: 0,
    rememberMe: false,
    provider: "password",
    linkedGoogle: false,
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await verify("111111", challenge)).status, 401);
  }
  assert.equal((await verify("111111", challenge)).status, 429);

  const missing = await verify("111111", "not-a-valid-challenge");
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).restart, true);

  // Changing the password (authVersion) invalidates challenges in flight.
  await db
    .collection<UserDocument>("users")
    .updateOne({ _id: user._id }, { $set: { authVersion: 1 } });
  await db.collection("rate_limits").deleteMany({});
  const stale = await verify("111111", challenge);
  assert.equal((await stale.json()).restart, true);
});

test("full design galleries require staff access or accepted Finished Designs terms", async () => {
  const customer = await insertUser({ role: "customer", email: "viewer@example.com" });
  const session = { id: customer._id.toHexString(), email: customer.email, name: customer.name, role: customer.role };
  assert.equal(await canViewFullDesignImages(db, null), false);
  assert.equal(await canViewFullDesignImages(db, session), false);
  assert.equal(await canViewFullDesignImages(db, { ...session, role: "admin" }), true);
  assert.equal(await canViewFullDesignImages(db, { ...session, role: "billing-clerk" }), true);

  await assert.rejects(
    acceptFinishedDesignsTerms(db, session, { accepted: true, version: "1999-01-01" }),
  );
  await assert.rejects(
    acceptFinishedDesignsTerms(db, { ...session, role: "admin" }, { accepted: true, version: finishedDesignsTerms.version }),
  );
  assert.equal(await hasAcceptedFinishedDesignsTerms(db, session.id), false);

  await acceptFinishedDesignsTerms(db, session, { accepted: true, version: finishedDesignsTerms.version });
  assert.equal(await hasAcceptedFinishedDesignsTerms(db, session.id), true);
  assert.equal(await canViewFullDesignImages(db, session), true);
  const record = await db.collection("audit_logs").findOne({ action: "finished-designs.terms-accepted" });
  assert.equal(record?.details.termsVersion, finishedDesignsTerms.version);
  assert.match(String(record?.details.termsSnapshot), /RA 8293/);
  assert.match(
    String(record?.details.termsSnapshot),
    /Case 3: Building a design[^\n]*\nLaw: RA 8293 \(Intellectual Property Code of the Philippines\), Section 186/,
  );
});
