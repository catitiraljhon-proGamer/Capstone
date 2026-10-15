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
import { createSessionToken, sessionCookieName } from "@/lib/server/session";
import { proxy } from "@/proxy";
import { accountTerms } from "@/lib/account-terms";
import { acceptAccountTerms, canViewFullDesignImages, getAccountTermsAcceptance } from "@/lib/server/account-terms";
import { POST as passwordLogin } from "@/app/api/auth/login/route";
import { GET as runPaymentReminders } from "@/app/api/cron/payment-reminders/route";

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

test("full design galleries require staff access or the account Terms and Conditions agreement", async () => {
  const customer = await insertUser({ role: "customer", email: "viewer@example.com" });
  const session = { id: customer._id.toHexString(), email: customer.email, name: customer.name, role: customer.role };
  assert.equal(await canViewFullDesignImages(db, null), false);
  assert.equal(await canViewFullDesignImages(db, session), false);
  assert.equal(await canViewFullDesignImages(db, { ...session, role: "admin" }), true);
  assert.equal(await canViewFullDesignImages(db, { ...session, role: "billing-clerk" }), true);

  await assert.rejects(acceptAccountTerms(db, session, { accepted: true, version: "1999-01-01" }));
  await assert.rejects(acceptAccountTerms(db, { ...session, role: "admin" }, { accepted: true, version: accountTerms.version }));
  assert.equal(await getAccountTermsAcceptance(db, session.id), null);

  const first = await acceptAccountTerms(db, session, { accepted: true, version: accountTerms.version });
  assert.ok(await getAccountTermsAcceptance(db, session.id));
  assert.equal(await canViewFullDesignImages(db, session), true);
  // Agreeing again keeps the original agreement: the terms are asked only once.
  assert.equal((await acceptAccountTerms(db, session, { accepted: true, version: accountTerms.version })).acceptedAt, first.acceptedAt);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "account.terms-accepted" }), 1);
  const record = await db.collection("audit_logs").findOne({ action: "account.terms-accepted" });
  assert.equal(record?.details.termsVersion, accountTerms.version);
  assert.match(String(record?.details.termsSnapshot), /RA 8293/);
  assert.match(String(record?.details.termsSnapshot), /You pay only for the blueprint/);
  assert.match(
    String(record?.details.termsSnapshot),
    /Case 3: Building a design[^\n]*\nLaw: RA 8293 \(Intellectual Property Code of the Philippines\), Section 186/,
  );
});

async function proxyRequest(
  path: string,
  session: { role: "admin" | "billing-clerk" | "customer" },
) {
  const token = await createSessionToken(
    {
      id: new ObjectId().toHexString(),
      email: "user@example.com",
      name: "User",
      role: session.role,
      authVersion: 0,
    },
    "1h",
  );
  const request = new NextRequest(`${origin}${path}`);
  request.cookies.set(sessionCookieName, token);
  return proxy(request);
}

test("only Vercel Cron, or a caller with CRON_SECRET, can run the payment reminder job", async () => {
  const run = (headers: Record<string, string>) =>
    runPaymentReminders(new Request("http://localhost:3000/api/cron/payment-reminders", { headers }));
  const previous = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await run({})).status, 401);
    assert.equal((await run({ "user-agent": "curl/8.0" })).status, 401);
    assert.equal((await run({ "user-agent": "vercel-cron/1.0" })).status, 200);
    process.env.CRON_SECRET = "test-cron-secret";
    assert.equal((await run({ "user-agent": "vercel-cron/1.0" })).status, 401);
    assert.equal((await run({ authorization: "Bearer wrong" })).status, 401);
    assert.equal((await run({ authorization: "Bearer test-cron-secret" })).status, 200);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("signed-in accounts open their own portal and are sent home from another role's", async () => {
  for (const [path, role] of [
    ["/admin/projects?tab=open", "admin"],
    ["/billing-clerk/invoices", "billing-clerk"],
    ["/customer", "customer"],
    ["/customer/complete-profile", "customer"],
  ] as const) {
    const response = await proxyRequest(path, { role });
    assert.equal(response.headers.get("location"), null, path);
  }
  const wrongRole = await proxyRequest("/admin/projects", { role: "customer" });
  assert.equal(wrongRole.headers.get("location"), `${origin}/customer`);
});
