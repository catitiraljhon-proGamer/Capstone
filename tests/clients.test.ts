import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { compare } from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { type Db, type MongoClient, ObjectId } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";
import { type UserDocument } from "@/lib/database/collections";
import { clientProfileSchema, ClientRequestError, createClient, getClient, listClients, toClientDto, updateClient } from "@/lib/server/clients";
import { assertClientMutation, clientApiError } from "@/lib/server/client-api";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryServer;
let db: Db;
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Test Admin", email: "admin@example.test", role: "admin" };
const details = { name: "Test Client", age: 35, contactNumber: "+63 917 123 4567", address: "123 Example Street, Sample City", occupation: "Engineer" };
const password = "Test-password-2026";

function legacyUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return { _id: new ObjectId(), name: "Existing Client", email: "existing@example.test", role: "customer", status: "active", authVersion: 4, passwordHash: "existing-hash", googleSub: new ObjectId().toHexString(), createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_client_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  await Promise.all(["users", "audit_logs"].map((name) => db.collection(name).deleteMany({})));
});
after(async () => {
  const cache = globalThis as typeof globalThis & { mongoClientPromise?: Promise<MongoClient> };
  await (await cache.mongoClientPromise)?.close();
  await mongo?.stop();
});

test("validates ages, required contact details, and overposted account fields", () => {
  assert.equal(clientProfileSchema.parse({ ...details, age: 0 }).age, 0);
  assert.equal(clientProfileSchema.parse({ ...details, occupation: "  " }).occupation, "");
  for (const change of [{ age: -1 }, { age: 121 }, { age: 1.5 }, { age: "35" }, { age: null }, { contactNumber: "abcdefg" }, { contactNumber: "123--456" }, { contactNumber: "1".repeat(16) }, { address: "   " }, { name: " " }, { role: "admin" }, { email: "changed@example.test" }, { passwordHash: "injected" }]) {
    assert.equal(clientProfileSchema.safeParse({ ...details, ...change }).success, false, JSON.stringify(change));
  }
});

test("existing users remain readable with incomplete information and no exposed credentials", () => {
  const dto = toClientDto(legacyUser());
  assert.equal(dto.age, null);
  assert.equal(dto.contactNumber, "");
  assert.equal(dto.profileComplete, false);
  for (const key of ["passwordHash", "googleSub", "authVersion"]) assert.equal(key in dto, false);
});

test("admin creates a customer account with hashed password and saved client information", async () => {
  const dto = await createClient(db, admin, { ...details, email: "  NEW@EXAMPLE.TEST  ", password });
  const saved = await db.collection<UserDocument>("users").findOne({ _id: new ObjectId(dto.id) });
  assert.ok(saved);
  assert.equal(saved.email, "new@example.test");
  assert.equal(saved.role, "customer");
  assert.equal(saved.status, "active");
  assert.equal(await compare(password, saved.passwordHash!), true);
  assert.equal(saved.clientDetails?.contactNumber, details.contactNumber);
  assert.equal(dto.profileComplete, true);
  assert.equal("passwordHash" in dto, false);
  const audit = await db.collection("audit_logs").findOne({ action: "client.created" });
  assert.ok(audit);
  assert.equal(JSON.stringify(audit).includes(password), false);
});

test("customer updates only their profile and the administrator reads the same saved record", async () => {
  const original = legacyUser();
  await db.collection<UserDocument>("users").insertOne(original);
  const actor: SessionUser = { id: original._id.toHexString(), name: original.name, email: original.email, role: "customer" };
  await updateClient(db, actor, actor.id, details);
  const dto = await getClient(db, admin, actor.id);
  assert.equal(dto.name, details.name);
  assert.equal(dto.age, details.age);
  assert.equal(dto.profileComplete, true);
  const saved = await db.collection<UserDocument>("users").findOne({ _id: original._id });
  for (const field of ["email", "role", "status", "googleSub", "passwordHash", "authVersion"] as const) assert.equal(saved?.[field], original[field]);
  assert.equal(await db.collection("users").countDocuments(), 1);
  const audit = await db.collection("audit_logs").findOne({ action: "client.updated" });
  assert.ok(audit);
  assert.equal(JSON.stringify(audit).includes(details.address), false);
  assert.equal(JSON.stringify(audit).includes(details.contactNumber), false);
});

test("customers and billing clerks cannot list, create, read, or edit other clients", async () => {
  const record = legacyUser();
  await db.collection<UserDocument>("users").insertOne(record);
  for (const role of ["customer", "billing-clerk"] as const) {
    const actor = { ...admin, role };
    const denied = (error: unknown) => error instanceof ClientRequestError && error.status === 403;
    await assert.rejects(listClients(db, actor, {}), denied);
    await assert.rejects(createClient(db, actor, { ...details, email: "unauthorized@example.test", password }), denied);
    await assert.rejects(getClient(db, actor, record._id.toHexString()), denied);
    await assert.rejects(updateClient(db, actor, record._id.toHexString(), details), denied);
  }
  assert.equal((await db.collection("users").findOne({ _id: record._id }))?.name, record.name);
  assert.equal(await db.collection("audit_logs").countDocuments(), 0);
});

test("client APIs cannot modify staff accounts, invalid ids, or unknown account fields", async () => {
  const staff = legacyUser({ role: "admin" });
  await db.collection<UserDocument>("users").insertOne(staff);
  await assert.rejects(updateClient(db, admin, staff._id.toHexString(), details), (error: unknown) => error instanceof ClientRequestError && error.status === 404);
  await assert.rejects(getClient(db, admin, "invalid-id"), (error: unknown) => error instanceof ClientRequestError && error.status === 400);
  await assert.rejects(updateClient(db, admin, new ObjectId().toHexString(), { ...details, role: "admin" }));
  assert.equal((await db.collection("users").findOne({ _id: staff._id }))?.name, staff.name);
});

test("client searches are literal, paginated, and exclude staff", async () => {
  await db.collection<UserDocument>("users").insertMany([
    legacyUser({ name: "Literal [.*]", email: "literal@example.test", clientDetails: { age: 35, contactNumber: "09171234567", address: "Sample Address", occupation: "" } }),
    legacyUser({ email: "second@example.test" }),
    legacyUser({ email: "staff@example.test", role: "admin" }),
  ]);
  const result = await listClients(db, admin, { q: "[.*]", pageSize: 1 });
  assert.equal(result.total, 1);
  assert.equal(result.clients[0].name, "Literal [.*]");
  assert.equal((await listClients(db, admin, { q: "0917" })).total, 1);
  assert.equal((await listClients(db, admin, { q: "Sample Address" })).total, 1);
  const finalPage = await listClients(db, admin, { page: 50, pageSize: 1 });
  assert.equal(finalPage.page, 2);
  assert.equal(finalPage.total, 2);
  assert.equal(finalPage.clients.length, 1);
});

test("duplicate account emails are rejected without another client record", async () => {
  const input = { ...details, email: "unique@example.test", password };
  await createClient(db, admin, input);
  try { await createClient(db, admin, input); assert.fail("Expected duplicate email error"); }
  catch (error) { assert.equal(clientApiError(error).status, 409); }
  assert.equal(await db.collection("users").countDocuments(), 1);
});

test("client writes reject cross-origin requests and non-JSON forms", () => {
  const url = "https://app.example/api/profile";
  assert.doesNotThrow(() => assertClientMutation(new Request(url, { method: "PATCH", headers: { origin: "https://app.example", "Content-Type": "application/json" } })));
  for (const headers of [{ origin: "https://attacker.example", "Content-Type": "application/json" }, { "sec-fetch-site": "cross-site", "Content-Type": "application/json" }, { "Content-Type": "text/plain" }]) {
    assert.throws(() => assertClientMutation(new Request(url, { method: "PATCH", headers })));
  }
});
