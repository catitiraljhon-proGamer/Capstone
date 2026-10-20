import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { compare, hash } from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { type Db, ObjectId } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";
import type { UserDocument } from "@/lib/database/collections";
import { POST as requestReset } from "@/app/api/auth/password-reset/route";
import { POST as confirmReset } from "@/app/api/auth/password-reset/confirm/route";

let mongo: MongoMemoryServer;
let db: Db;
let devLog: string[] = [];
const originalInfo = console.info;

before(async () => {
  process.env.AUTH_SECRET = "test-only-auth-secret-that-is-long-enough-for-hmac";
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "password_reset_tests";
  db = await getDatabase();
  // Without Gmail settings the route logs the email; capture it to read the link.
  console.info = (...args: unknown[]) => devLog.push(args.map(String).join(" "));
});

beforeEach(async () => {
  devLog = [];
  // Only the isolated in-memory test database is modified.
  await Promise.all(["users", "audit_logs", "rate_limits"].map((name) => db.collection(name).deleteMany({})));
});

after(async () => {
  console.info = originalInfo;
  const cache = globalThis as typeof globalThis & {
    mongoClientPromise?: Promise<{ close(): Promise<void> }>;
  };
  await (await cache.mongoClientPromise)?.close();
  await mongo?.stop();
});

async function insertUser(overrides: Partial<UserDocument> = {}) {
  const user: UserDocument = {
    _id: new ObjectId(),
    name: "Client One",
    email: "client@gmail.com",
    passwordHash: await hash("Old-password-123", 4),
    role: "customer",
    status: "active",
    authVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await db.collection<UserDocument>("users").insertOne(user);
  return user;
}

function post(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "203.0.113.5" },
    body: JSON.stringify(body),
  });
}

function tokenFromLog() {
  const match = devLog.join("\n").match(/reset-password\?token=([^\s]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

test("gives the same answer whether or not the email has an account", async () => {
  await insertUser();
  const known = await (await requestReset(post("/api/auth/password-reset", { email: "client@gmail.com" }))).json();
  const unknown = await (await requestReset(post("/api/auth/password-reset", { email: "nobody@gmail.com" }))).json();
  assert.deepEqual(known, unknown);
  assert.equal(devLog.length, 1, "only the real account gets an email");
});

test("a Google-only account gets a sign-in reminder instead of a reset link", async () => {
  await insertUser({ passwordHash: undefined, googleSub: "google-123" });
  const response = await requestReset(post("/api/auth/password-reset", { email: "client@gmail.com" }));
  assert.equal(response.status, 200);
  assert.equal(tokenFromLog(), null);
  assert.match(devLog.join("\n"), /Sign in with Google/);
});

test("the link sets a new password once and signs out every session", async () => {
  const user = await insertUser();
  await requestReset(post("/api/auth/password-reset", { email: "client@gmail.com" }));
  const token = tokenFromLog();
  assert.ok(token);

  const first = await confirmReset(post("/api/auth/password-reset/confirm", { token, password: "New-password-456" }));
  assert.equal(first.status, 200);
  const updated = await db.collection<UserDocument>("users").findOne({ _id: user._id });
  assert.ok(updated?.passwordHash && (await compare("New-password-456", updated.passwordHash)));
  assert.equal(updated?.authVersion, 1);

  const second = await confirmReset(post("/api/auth/password-reset/confirm", { token, password: "Another-pass-789" }));
  assert.equal(second.status, 400);
  assert.equal((await second.json()).expired, true);
});

test("rejects a tampered link", async () => {
  await insertUser();
  const response = await confirmReset(
    post("/api/auth/password-reset/confirm", { token: "not-a-real-token", password: "New-password-456" }),
  );
  assert.equal(response.status, 400);
});

test("limits how many reset emails one address can receive", async () => {
  await insertUser();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal((await requestReset(post("/api/auth/password-reset", { email: "client@gmail.com" }))).status, 200);
  }
  assert.equal((await requestReset(post("/api/auth/password-reset", { email: "client@gmail.com" }))).status, 429);
});
