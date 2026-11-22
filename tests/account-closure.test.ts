import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDatabase } from "@/lib/database/mongodb";
import type { InvoiceDocument, ProjectDocument, UserDocument } from "@/lib/database/collections";
import {
  AccountClosureError, closeAccount, findReactivation, getAccountClosure, processDeactivatedAccounts, reactivateAccount,
  reactivationCookieName, setReactivationCookie, signInAccountFilter,
} from "@/lib/server/account-closure";
import { listClients } from "@/lib/server/clients";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryReplSet;
let db: Db;
const day = 86_400_000;
const customer: SessionUser = { id: new ObjectId().toHexString(), name: "Maria Santos", email: "maria@example.test", role: "customer" };
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const isStatus = (status: number) => (error: unknown) => error instanceof AccountClosureError && error.status === status;
const user = () => db.collection<UserDocument>("users").findOne({ _id: new ObjectId(customer.id) });

before(async () => {
  process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_account_closure_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_account_closure_tests");
  await Promise.all(["users", "projects", "invoices", "payments", "design_requests", "cost_estimates", "warranty_claims", "notifications", "audit_logs", "system_settings"]
    .map((name) => db.collection(name).deleteMany({})));
  const now = new Date();
  await db.collection<UserDocument>("users").insertMany([
    {
      _id: new ObjectId(customer.id), name: customer.name, email: customer.email, role: "customer", status: "active", authVersion: 0,
      passwordHash: "hash", googleSub: "google-sub",
      clientDetails: { contactNumber: "+63 917 123 4567", address: "Santa Rosa, Laguna", occupation: "Teacher" },
      createdAt: now, updatedAt: now,
    },
    { _id: new ObjectId(admin.id), name: admin.name, email: admin.email, role: "admin", status: "active", createdAt: now, updatedAt: now },
  ]);
});
after(async () => { await db?.client.close(); await mongo?.stop(); });

test("a customer with nothing open deactivates; they are signed out and deleted after 60 days unless they come back", async () => {
  const now = new Date("2026-11-19T07:00:00.000Z");
  const closure = await getAccountClosure(db, customer, now);
  assert.equal(closure.canClose, true);
  assert.equal(closure.deleteDays, 60);
  assert.equal(closure.deletesOn, "January 18, 2027");
  assert.equal(closure.remindsOn, "January 11, 2027");

  assert.deepEqual(await closeAccount(db, customer, { action: "deactivate", reason: "My project is finished" }, now), { action: "deactivate", deletesOn: "2027-01-18" });
  const deactivated = await user();
  assert.equal(deactivated?.status, "disabled");
  assert.equal(deactivated?.authVersion, 1);
  assert.equal(deactivated?.deactivation?.reason, "My project is finished");
  assert.equal(deactivated?.deactivation?.deletesAt.toISOString(), new Date(now.getTime() + 60 * day).toISOString());
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(admin.id), title: "Client deactivated their account" }), 1);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "account.deactivated" }), 1);

  // They can still be found to sign in (and reactivate), and show as Deactivated in Client Records.
  assert.ok(await db.collection<UserDocument>("users").findOne({ email: customer.email, ...signInAccountFilter }));
  const [listed] = (await listClients(db, admin, {})).clients;
  assert.equal(listed.deactivation?.deletesOn, "January 18, 2027");
  // Deactivating twice is refused: the account is no longer active.
  await assert.rejects(closeAccount(db, customer, { action: "deactivate" }, now), isStatus(404));
});

test("anything still open keeps the account from being deactivated or deleted", async () => {
  const now = new Date();
  const projectId = new ObjectId();
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: projectId, reference: "PRJ-1", name: "Two-Storey Residence", customerId: new ObjectId(customer.id),
    status: "Active", contractPrice: 1_000_000, createdAt: now, updatedAt: now,
  });
  await db.collection<InvoiceDocument>("invoices").insertOne({
    _id: new ObjectId(), invoiceNumber: "INV-2026-0042", customerId: new ObjectId(customer.id), projectId, label: "Stage 4",
    progressPercentage: 20, amount: 125_000, dueDate: new Date("2099-01-01T00:00:00.000Z"), status: "Sent", createdAt: now, updatedAt: now,
  });
  const closure = await getAccountClosure(db, customer);
  assert.equal(closure.canClose, false);
  assert.equal(closure.checks.find((check) => check.key === "projects")?.detail, "Two-Storey Residence is active.");
  assert.match(closure.checks.find((check) => check.key === "balance")!.detail, /INV-2026-0042 still has ₱125,000\.00 to pay/);
  await assert.rejects(closeAccount(db, customer, { action: "deactivate" }), isStatus(409));
  await assert.rejects(closeAccount(db, customer, { action: "delete", confirm: "DELETE" }), isStatus(409));
  assert.equal((await user())?.status, "active");
});

test("deleting needs DELETE typed, removes the sign-in and personal details, and keeps the record with the name", async () => {
  await db.collection("notifications").insertOne({ _id: new ObjectId(), userId: new ObjectId(customer.id), title: "Hi", body: "Old", createdAt: new Date() });
  await assert.rejects(closeAccount(db, customer, { action: "delete", confirm: "remove" }), ZodError);
  await assert.rejects(closeAccount(db, admin, { action: "delete", confirm: "DELETE" }), isStatus(403));

  assert.deepEqual(await closeAccount(db, customer, { action: "delete", confirm: " delete " }), { action: "delete" });
  const deleted = await user();
  assert.equal(deleted?.name, "Maria Santos");
  assert.equal(deleted?.status, "disabled");
  assert.ok(deleted?.deletedAt);
  assert.equal(deleted?.email, `deleted-${customer.id}@deleted.invalid`);
  assert.equal(deleted?.passwordHash, undefined);
  assert.equal(deleted?.googleSub, undefined);
  assert.equal(deleted?.clientDetails, undefined);
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(customer.id) }), 0);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "account.deleted" }), 1);
  // Gone from sign-in and from Client Records; the old email can register again.
  assert.equal(await db.collection<UserDocument>("users").findOne({ _id: new ObjectId(customer.id), ...signInAccountFilter }), null);
  assert.equal((await listClients(db, admin, {})).total, 0);
});

test("signing back in with the reactivation cookie turns the account back on", async () => {
  await closeAccount(db, customer, { action: "deactivate" });
  const response = NextResponse.json({});
  await setReactivationCookie(response, (await user())!, true);
  const token = response.cookies.get(reactivationCookieName)?.value;
  const waiting = await findReactivation(db, token);
  assert.equal(waiting?.rememberMe, true);
  assert.equal(await findReactivation(db, "not-a-token"), null);

  const active = await reactivateAccount(db, waiting!.user);
  assert.equal(active.status, "active");
  assert.equal(active.deactivation, undefined);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "account.reactivated" }), 1);
  // The cookie is single-use: the account is no longer waiting.
  assert.equal(await findReactivation(db, token), null);
});

test("the daily job reminds once, then deletes accounts whose date has come", async () => {
  const deactivatedAt = new Date("2026-11-19T07:00:00.000Z");
  await closeAccount(db, customer, { action: "deactivate" }, deactivatedAt);
  const at = (days: number) => new Date(deactivatedAt.getTime() + days * day);

  assert.deepEqual(await processDeactivatedAccounts(db, at(50)), { reminded: 0, deleted: 0 });
  assert.deepEqual(await processDeactivatedAccounts(db, at(53)), { reminded: 1, deleted: 0 });
  assert.ok((await user())?.deactivation?.reminderSentAt);
  assert.deepEqual(await processDeactivatedAccounts(db, at(54)), { reminded: 0, deleted: 0 });
  assert.deepEqual(await processDeactivatedAccounts(db, at(60)), { reminded: 0, deleted: 1 });
  assert.ok((await user())?.deletedAt);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "account.auto-deleted" }), 1);
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(admin.id), title: "Deactivated account deleted" }), 1);
  assert.deepEqual(await processDeactivatedAccounts(db, at(61)), { reminded: 0, deleted: 0 });
});
