import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { createHash } from "node:crypto";
import {
  generateKeyPair,
  exportJWK,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from "jose";
import { hash } from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { type Db, MongoClient, MongoNetworkError, ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import { type UserDocument } from "@/lib/database/collections";
import { getAuthSecret } from "@/lib/server/auth-secret";
import { googleAuthErrorMessage } from "@/lib/google-auth-errors";
import {
  createGoogleFlow,
  createGoogleLink,
  getGoogleConfig,
  googleFlowCookieName,
  googleLinkCookieName,
  readGoogleFlow,
  readGoogleLink,
  verifyGoogleIdToken,
} from "@/lib/server/google-oauth";
import { resolveGoogleAccount } from "@/lib/server/google-accounts";
import { sessionCookieName } from "@/lib/server/session";
import { GET as startGoogle } from "@/app/api/auth/google/route";
import { GET as googleCallback } from "@/app/api/auth/google/callback/route";
import { POST as passwordLogin } from "@/app/api/auth/login/route";

const origin = "http://localhost:3000";
const clientId = "test-client.apps.googleusercontent.com";
const profile = {
  sub: "google-subject-123",
  email: "client@example.com",
  name: "Test Client",
};
let mongo: MongoMemoryServer;
let db: Db;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let passwordHash: string;

before(async () => {
  process.env.AUTH_SECRET =
    "test-only-auth-secret-that-is-long-enough-for-hmac";
  process.env.GOOGLE_CLIENT_ID = clientId;
  process.env.GOOGLE_CLIENT_SECRET = "test-only-google-secret";
  process.env.GOOGLE_REDIRECT_URI = `${origin}/api/auth/google/callback`;
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "google_auth_tests";
  db = await getDatabase();
  keys = await generateKeyPair("RS256", { extractable: true });
  passwordHash = await hash("Existing-password-123", 4);
});

beforeEach(async () => {
  mock.restoreAll();
  // Only the isolated in-memory test database is modified.
  await Promise.all(
    ["users", "notifications", "audit_logs"].map((name) =>
      db.collection(name).deleteMany({}),
    ),
  );
});

after(async () => {
  mock.restoreAll();
  const cache = globalThis as typeof globalThis & {
    mongoClientPromise?: Promise<{ close(): Promise<void> }>;
  };
  await (await cache.mongoClientPromise)?.close();
  await mongo?.stop();
});

function user(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    _id: new ObjectId(),
    name: profile.name,
    email: profile.email,
    passwordHash,
    role: "customer",
    status: "active",
    authVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function idToken(nonce: string, overrides: JWTPayload = {}) {
  return new SignJWT({
    sub: profile.sub,
    email: profile.email,
    email_verified: true,
    name: profile.name,
    nonce,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(
      typeof overrides.iss === "string"
        ? overrides.iss
        : "https://accounts.google.com",
    )
    .setAudience(typeof overrides.aud === "string" ? overrides.aud : clientId)
    .setIssuedAt()
    .setExpirationTime(typeof overrides.exp === "number" ? overrides.exp : "5m")
    .sign(keys.privateKey);
}

async function callbackRequest(
  mode: "login" | "register" = "login",
  rememberMe = false,
  overrides: JWTPayload = {},
) {
  const start = await createGoogleFlow(mode, rememberMe);
  const state = start.url.searchParams.get("state")!;
  const nonce = start.url.searchParams.get("nonce")!;
  const token = await idToken(nonce, overrides);
  const jwk = await exportJWK(keys.publicKey);
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://www.googleapis.com/oauth2/v3/certs") {
        return Response.json({
          keys: [{ ...jwk, alg: "RS256", use: "sig", kid: "test-key" }],
        });
      }
      assert.equal(url, "https://oauth2.googleapis.com/token");
      assert.equal(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("client_id"), clientId);
      assert.equal(body.get("client_secret"), "test-only-google-secret");
      assert.equal(body.get("redirect_uri"), process.env.GOOGLE_REDIRECT_URI);
      assert.equal(body.get("code"), "one-use-test-code");
      assert.equal(
        createHash("sha256")
          .update(body.get("code_verifier")!)
          .digest("base64url"),
        start.url.searchParams.get("code_challenge"),
      );
      return Response.json({ id_token: token });
    },
  );
  return new NextRequest(
    `${origin}/api/auth/google/callback?code=one-use-test-code&state=${state}`,
    {
      headers: { cookie: `${googleFlowCookieName}=${start.cookie}` },
    },
  );
}

function loginRequest(
  email: string,
  password: string,
  options: {
    linkCookie?: string;
    linkGoogle?: boolean;
    rememberMe?: boolean;
    requestOrigin?: string;
  } = {},
) {
  return new NextRequest(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: options.requestOrigin ?? origin,
      ...(options.linkCookie
        ? { cookie: `${googleLinkCookieName}=${options.linkCookie}` }
        : {}),
    },
    body: JSON.stringify({
      email,
      password,
      linkGoogle: options.linkGoogle ?? false,
      rememberMe: options.rememberMe ?? false,
    }),
  });
}

test("Google authorization requests use state, nonce, PKCE and only identity scopes", async () => {
  const first = await createGoogleFlow("register", true);
  const second = await createGoogleFlow("login", false);
  const flow = await readGoogleFlow(
    first.cookie,
    first.url.searchParams.get("state"),
  );
  assert.equal(first.url.origin, "https://accounts.google.com");
  assert.equal(first.url.searchParams.get("scope"), "openid email profile");
  assert.equal(first.url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    first.url.searchParams.get("code_challenge"),
    createHash("sha256").update(flow.verifier).digest("base64url"),
  );
  assert.equal(flow.mode, "register");
  assert.equal(flow.rememberMe, true);
  assert.notEqual(
    first.url.searchParams.get("state"),
    second.url.searchParams.get("state"),
  );
  assert.notEqual(
    first.url.searchParams.get("nonce"),
    second.url.searchParams.get("nonce"),
  );
  assert.equal(first.url.searchParams.has("client_secret"), false);
});

test("missing, tampered, mismatched and expired OAuth state are rejected", async () => {
  const { cookie, url } = await createGoogleFlow("login", false);
  const state = url.searchParams.get("state");
  await assert.rejects(readGoogleFlow(undefined, state));
  await assert.rejects(readGoogleFlow(`${cookie}tampered`, state));
  await assert.rejects(readGoogleFlow(cookie, "wrong-state"));
  const flow = await readGoogleFlow(cookie, state);
  const expired = await new SignJWT(flow)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("g4-builders")
    .setAudience("google-flow")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
    .sign(getAuthSecret());
  await assert.rejects(readGoogleFlow(expired, state));
  assert.equal(await readGoogleLink(cookie), null);
});

test("Google ID tokens must have a valid signature and expected identity claims", async () => {
  const valid = await idToken("expected-nonce");
  const resolveKey = async () => keys.publicKey;
  assert.deepEqual(
    await verifyGoogleIdToken(valid, "expected-nonce", clientId, resolveKey),
    profile,
  );
  for (const overrides of [
    { aud: "another-client" },
    { iss: "https://attacker.example" },
    { exp: Math.floor(Date.now() / 1000) - 60 },
    { nonce: "wrong-nonce" },
    { email_verified: false },
    { azp: "another-client" },
    { sub: "" },
  ]) {
    await assert.rejects(
      verifyGoogleIdToken(
        await idToken("expected-nonce", overrides),
        "expected-nonce",
        clientId,
        resolveKey,
      ),
    );
  }
  await assert.rejects(
    verifyGoogleIdToken(
      `${valid}tampered`,
      "expected-nonce",
      clientId,
      resolveKey,
    ),
  );
});

test("configuration accepts localhost and HTTPS but rejects insecure remote callbacks", () => {
  const saved = process.env.GOOGLE_REDIRECT_URI;
  try {
    for (const value of [
      "http://public.example/api/auth/google/callback",
      `${origin}/wrong-path`,
      `${origin}/api/auth/google/callback?next=evil`,
      "not-a-url",
    ]) {
      process.env.GOOGLE_REDIRECT_URI = value;
      assert.throws(getGoogleConfig);
    }
    process.env.GOOGLE_REDIRECT_URI =
      "https://app.example/api/auth/google/callback";
    assert.equal(getGoogleConfig().origin, "https://app.example");
  } finally {
    process.env.GOOGLE_REDIRECT_URI = saved;
  }
});

test("start endpoint sets a protected cookie and stays on the configured origin", async () => {
  const response = await startGoogle(
    new NextRequest(`${origin}/api/auth/google?mode=register&rememberMe=true`),
  );
  assert.equal(
    new URL(response.headers.get("location")!).origin,
    "https://accounts.google.com",
  );
  const cookie = response.cookies.get(googleFlowCookieName)!;
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.maxAge, 600);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const alias = await startGoogle(
    new NextRequest("http://127.0.0.1:3000/api/auth/google?mode=register", {
      headers: { host: "127.0.0.1:3000" },
    }),
  );
  assert.equal(
    alias.headers.get("location"),
    `${origin}/api/auth/google?mode=register`,
  );
});

test("callback error messages only render known text", () => {
  for (const code of [
    "constructor",
    "__proto__",
    "toString",
    "<script>untrusted</script>",
  ]) {
    assert.equal(
      googleAuthErrorMessage(code),
      "Unable to sign in with Google. Please try again.",
    );
  }
});

test("HTTPS reverse proxies can start Google authentication without a redirect loop", async () => {
  const saved = process.env.GOOGLE_REDIRECT_URI;
  try {
    process.env.GOOGLE_REDIRECT_URI =
      "https://app.example/api/auth/google/callback";
    const request = new NextRequest(`${origin}/api/auth/google`, {
      headers: {
        host: "localhost:3000",
        "x-forwarded-host": "app.example",
        "x-forwarded-proto": "https",
      },
    });
    const response = await startGoogle(request);
    assert.equal(
      new URL(response.headers.get("location")!).origin,
      "https://accounts.google.com",
    );
    assert.equal(response.cookies.has(googleFlowCookieName), true);
  } finally {
    process.env.GOOGLE_REDIRECT_URI = saved;
  }
});

test("missing Google configuration returns to the correct form", async () => {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  try {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const response = await startGoogle(
      new NextRequest(`${origin}/api/auth/google?mode=register`),
    );
    assert.equal(
      response.headers.get("location"),
      `${origin}/register?google_error=not_configured`,
    );
  } finally {
    process.env.GOOGLE_CLIENT_SECRET = secret;
  }
});

test("cancelled consent preserves signup context and clears the temporary cookie", async () => {
  const flow = await createGoogleFlow("register", false);
  const response = await googleCallback(
    new NextRequest(
      `${origin}/api/auth/google/callback?error=access_denied&state=${flow.url.searchParams.get("state")}`,
      {
        headers: { cookie: `${googleFlowCookieName}=${flow.cookie}` },
      },
    ),
  );
  assert.equal(
    response.headers.get("location"),
    `${origin}/register?google_error=cancelled`,
  );
  assert.equal(response.cookies.get(googleFlowCookieName)?.maxAge, 0);
  assert.equal(response.cookies.has(sessionCookieName), false);
});

test("callbacks without a matching browser state never authenticate", async () => {
  const response = await googleCallback(
    new NextRequest(
      `${origin}/api/auth/google/callback?code=untrusted&state=wrong`,
    ),
  );
  assert.equal(
    response.headers.get("location"),
    `${origin}/login?google_error=expired`,
  );
  assert.equal(response.cookies.has(sessionCookieName), false);
  assert.equal(await db.collection("users").countDocuments(), 0);
});

test("new Google signup creates a customer, session, admin notification and audit event", async () => {
  const admin = user({ email: "admin@example.com", role: "admin" });
  await db.collection<UserDocument>("users").insertOne(admin);
  const response = await googleCallback(await callbackRequest("register"));
  assert.equal(response.headers.get("location"), `${origin}/customer`);
  const created = await db
    .collection<UserDocument>("users")
    .findOne({ googleSub: profile.sub });
  assert.ok(created);
  assert.equal(created.role, "customer");
  assert.equal(created.status, "active");
  assert.equal(created.passwordHash, undefined);
  const cookie = response.cookies.get(sessionCookieName)!;
  assert.equal(cookie.maxAge, 8 * 60 * 60);
  assert.equal(cookie.httpOnly, true);
  const { payload } = await jwtVerify(cookie.value, getAuthSecret());
  assert.equal(payload.sub, created._id.toHexString());
  assert.equal(payload.authVersion, 0);
  assert.equal(
    await db.collection("notifications").countDocuments({ userId: admin._id }),
    1,
  );
  assert.equal(
    await db
      .collection("audit_logs")
      .countDocuments({
        action: "auth.registered",
        "details.provider": "google",
      }),
    1,
  );
  assert.equal(response.cookies.get(googleFlowCookieName)?.maxAge, 0);
});

test("returning Google users retain their role, profile and 30-day remember-me session", async () => {
  const account = user({
    googleSub: profile.sub,
    role: "billing-clerk",
    name: "Saved Name",
    authVersion: 3,
  });
  await db.collection<UserDocument>("users").insertOne(account);
  const response = await googleCallback(
    await callbackRequest("login", true, { email: "changed@gmail.com" }),
  );
  assert.equal(response.headers.get("location"), `${origin}/billing-clerk`);
  const cookie = response.cookies.get(sessionCookieName)!;
  assert.equal(cookie.maxAge, 30 * 24 * 60 * 60);
  const { payload } = await jwtVerify(cookie.value, getAuthSecret());
  assert.equal(payload.name, "Saved Name");
  assert.equal(payload.email, account.email);
  assert.equal(payload.authVersion, 3);
  assert.equal(await db.collection("users").countDocuments(), 1);
  assert.equal(
    await db.collection("audit_logs").countDocuments({ action: "auth.login" }),
    1,
  );
});

test("Google login also registers a first-time customer", async () => {
  const response = await googleCallback(await callbackRequest());
  assert.equal(response.headers.get("location"), `${origin}/customer`);
  assert.equal(
    await db.collection("users").countDocuments({ role: "customer" }),
    1,
  );
});

test("disabled and conflicting Google accounts cannot obtain a session", async () => {
  for (const account of [
    user({ status: "disabled", googleSub: profile.sub }),
    user({ googleSub: "other-google-subject" }),
  ]) {
    await db.collection("users").deleteMany({});
    await db.collection<UserDocument>("users").insertOne(account);
    const response = await googleCallback(await callbackRequest());
    assert.equal(
      response.headers.get("location"),
      `${origin}/login?google_error=account_unavailable`,
    );
    assert.equal(response.cookies.has(sessionCookieName), false);
  }
});

test("existing password accounts require proof before Google can be connected", async () => {
  const account = user({ role: "admin" });
  await db.collection<UserDocument>("users").insertOne(account);
  const response = await googleCallback(await callbackRequest());
  assert.equal(
    response.headers.get("location"),
    `${origin}/login?google_link=1`,
  );
  assert.equal(response.cookies.has(sessionCookieName), false);
  assert.equal(
    (await db.collection("users").findOne({ _id: account._id }))?.googleSub,
    undefined,
  );
  const linkCookie = response.cookies.get(googleLinkCookieName)!.value;
  const wrong = await passwordLogin(
    loginRequest(profile.email, "Wrong-password", {
      linkCookie,
      linkGoogle: true,
    }),
  );
  assert.equal(wrong.status, 401);
  assert.equal(
    (await db.collection("users").findOne({ _id: account._id }))?.googleSub,
    undefined,
  );
  const correct = await passwordLogin(
    loginRequest(profile.email, "Existing-password-123", {
      linkCookie,
      linkGoogle: true,
    }),
  );
  assert.equal(correct.status, 200);
  assert.equal((await correct.json()).redirectTo, "/admin");
  assert.equal(
    (await db.collection("users").findOne({ _id: account._id }))?.googleSub,
    profile.sub,
  );
  assert.equal(correct.cookies.get(googleLinkCookieName)?.maxAge, 0);
});

test("linking rejects cross-origin requests, missing proof, other accounts and stale credentials", async () => {
  const account = user();
  await db.collection<UserDocument>("users").insertOne(account);
  const proof = {
    userId: account._id.toHexString(),
    googleSub: profile.sub,
    email: account.email,
    authVersion: 0,
    rememberMe: false,
  };
  const linkCookie = await createGoogleLink(proof);
  const requests = [
    loginRequest(profile.email, "Existing-password-123", {
      linkGoogle: true,
      linkCookie,
      requestOrigin: "https://attacker.example",
    }),
    loginRequest(profile.email, "Existing-password-123", { linkGoogle: true }),
    loginRequest(profile.email, "Existing-password-123", {
      linkGoogle: true,
      linkCookie: await createGoogleLink({
        ...proof,
        userId: new ObjectId().toHexString(),
      }),
    }),
    loginRequest(profile.email, "Existing-password-123", {
      linkGoogle: true,
      linkCookie: await createGoogleLink({ ...proof, authVersion: 1 }),
    }),
  ];
  for (const request of requests) {
    const response = await passwordLogin(request);
    assert.ok(response.status >= 400);
    assert.equal(response.cookies.has(sessionCookieName), false);
  }
  assert.equal(
    (await db.collection("users").findOne({ _id: account._id }))?.googleSub,
    undefined,
  );
});

test("Google-only accounts reject password login cleanly; existing password login still works", async () => {
  await resolveGoogleAccount(db, profile);
  const rejected = await passwordLogin(
    loginRequest(profile.email, "Any-password"),
  );
  assert.equal(rejected.status, 401);
  const account = user({
    email: "password@example.com",
    role: "billing-clerk",
  });
  await db.collection<UserDocument>("users").insertOne(account);
  const response = await passwordLogin(
    loginRequest(account.email, "Existing-password-123"),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirectTo, "/billing-clerk");
});

test("simultaneous first-time Google requests create only one account", async () => {
  const results = await Promise.all(
    Array.from({ length: 6 }, () => resolveGoogleAccount(db, profile)),
  );
  assert.equal(
    new Set(results.map((result) => result.user._id.toHexString())).size,
    1,
  );
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(await db.collection("users").countDocuments(), 1);
});

test("provider failure and unverified identity do not create an account or session", async () => {
  const invalidIdentity = await googleCallback(
    await callbackRequest("register", false, { email_verified: false }),
  );
  assert.equal(
    invalidIdentity.headers.get("location"),
    `${origin}/register?google_error=unverified_email`,
  );
  assert.equal(invalidIdentity.cookies.has(sessionCookieName), false);
  const request = await callbackRequest();
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "invalid_grant" }, { status: 400 }),
  );
  const failure = await googleCallback(request);
  assert.equal(
    failure.headers.get("location"),
    `${origin}/login?google_error=failed`,
  );
  assert.equal(failure.cookies.has(sessionCookieName), false);
  assert.equal(await db.collection("users").countDocuments(), 0);
});

test("database failures return a useful error, log no secrets, and allow the next login to recover", async () => {
  const cache = globalThis as typeof globalThis & {
    mongoClientPromise?: Promise<MongoClient>;
  };
  const healthyConnection = cache.mongoClientPromise;
  cache.mongoClientPromise = undefined;
  const errorLog = mock.method(console, "error", () => {});
  mock.method(MongoClient.prototype, "connect", async () => {
    throw new MongoNetworkError("private database URI and credentials");
  });
  try {
    const response = await googleCallback(await callbackRequest("register"));
    assert.equal(
      response.headers.get("location"),
      `${origin}/register?google_error=database_unavailable`,
    );
    assert.equal(response.cookies.has(sessionCookieName), false);
    assert.equal(response.cookies.get(googleFlowCookieName)?.maxAge, 0);
    assert.equal(await db.collection("users").countDocuments(), 0);
    assert.equal(cache.mongoClientPromise, undefined);
    assert.deepEqual(errorLog.mock.calls.map((call) => call.arguments), [
      ["Google sign-in failed", {
        stage: "database",
        code: "database_unavailable",
        errorType: "MongoNetworkError",
      }],
    ]);
  } finally {
    mock.restoreAll();
    cache.mongoClientPromise = healthyConnection;
  }
  const retry = await googleCallback(await callbackRequest("register"));
  assert.equal(retry.headers.get("location"), `${origin}/customer`);
  assert.equal(retry.cookies.has(sessionCookieName), true);
});
