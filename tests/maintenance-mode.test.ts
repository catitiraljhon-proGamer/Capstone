import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getDatabase } from "@/lib/database/mongodb";
import { formatTimeLeft } from "@/lib/maintenance-mode";
import { MaintenanceError } from "@/lib/server/maintenance";
import { changeMaintenanceMode, readMaintenanceMode } from "@/lib/server/maintenance-mode";
import { createSessionToken } from "@/lib/server/session";
import { proxy } from "@/proxy";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryReplSet;
let db: Db;
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const clerk: SessionUser = { id: new ObjectId().toHexString(), name: "Billing Clerk", email: "clerk@example.test", role: "billing-clerk" };
const customer: SessionUser = { id: new ObjectId().toHexString(), name: "Customer", email: "customer@example.test", role: "customer" };
const isStatus = (status: number) => (error: unknown) => error instanceof MaintenanceError && error.status === status;
const minutesLater = (from: Date, minutes: number) => new Date(from.getTime() + minutes * 60_000);

async function requestAs(actor: SessionUser | null, path: string) {
  const headers: Record<string, string> = {};
  if (actor) headers.cookie = `g4_session=${await createSessionToken({ ...actor, authVersion: 0 }, "1h")}`;
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_maintenance_mode_tests";
  process.env.AUTH_SECRET = "isolated-maintenance-mode-test-secret-32-chars";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_maintenance_mode_tests");
  await Promise.all(["system_settings", "audit_logs"].map((name) => db.collection(name).deleteMany({})));
  await readMaintenanceMode(db, new Date(), { fresh: true });
});
after(async () => { await db?.client.close(); await mongo?.stop(); });

test("the Admin starts, extends, and ends maintenance, and it ends by itself at the set time", async () => {
  const now = new Date("2026-10-17T09:00:00.000Z");
  await assert.rejects(changeMaintenanceMode(db, clerk, { action: "start", minutes: 120 }, now), isStatus(403));
  await assert.rejects(changeMaintenanceMode(db, admin, { action: "start", minutes: 5 }, now), ZodError);
  await assert.rejects(changeMaintenanceMode(db, admin, { action: "end" }, now), isStatus(409));

  const started = await changeMaintenanceMode(db, admin, { action: "start", minutes: 120, message: "Upgrading payments." }, now);
  assert.deepEqual(started, {
    active: true, endsAt: minutesLater(now, 120).toISOString(), message: "Upgrading payments.", startedAt: now.toISOString(), startedByName: "Admin",
  });
  assert.equal(formatTimeLeft(started.endsAt!, minutesLater(now, 15)), "1 hr 45 min");
  await assert.rejects(changeMaintenanceMode(db, admin, { action: "start", minutes: 60 }, now), isStatus(409));

  const extended = await changeMaintenanceMode(db, admin, { action: "extend", minutes: 30 }, minutesLater(now, 60));
  assert.equal(extended.endsAt, minutesLater(now, 150).toISOString());

  assert.equal((await readMaintenanceMode(db, minutesLater(now, 149), { fresh: true })).active, true);
  assert.equal((await readMaintenanceMode(db, minutesLater(now, 150), { fresh: true })).active, false);

  await changeMaintenanceMode(db, admin, { action: "start", minutes: 60 }, minutesLater(now, 200));
  const ended = await changeMaintenanceMode(db, admin, { action: "end" }, minutesLater(now, 210));
  assert.equal(ended.active, false);

  const actions = (await db.collection("audit_logs").find().sort({ createdAt: 1 }).toArray()).map((log) => log.action);
  assert.deepEqual(actions, ["Started maintenance mode", "Extended maintenance mode", "Started maintenance mode", "Ended maintenance mode"]);
});

test("during maintenance the proxy pauses customer and Billing Clerk pages and actions, but not the Admin or sign-in", async () => {
  await changeMaintenanceMode(db, admin, { action: "start", minutes: 60 });

  for (const [actor, page] of [[customer, "/customer/invoices"], [clerk, "/billing-clerk/payments"]] as const) {
    const pageResponse = await requestAs(actor, page);
    assert.match(pageResponse.headers.get("x-middleware-rewrite") ?? "", /\/maintenance$/);
    const apiResponse = await requestAs(actor, "/api/billing");
    assert.equal(apiResponse.status, 503);
    assert.match(((await apiResponse.json()) as { error: string }).error, /under maintenance until/);
  }

  const adminPage = await requestAs(admin, "/admin/projects");
  assert.equal(adminPage.headers.get("x-middleware-rewrite"), null);
  assert.equal((await requestAs(admin, "/api/billing")).status, 200);
  assert.equal((await requestAs(customer, "/api/auth/logout")).status, 200);
  assert.equal((await requestAs(customer, "/api/maintenance/mode")).status, 200);
  // Payment provider webhooks and cron jobs carry no session, so they keep running.
  assert.equal((await requestAs(null, "/api/payments/paymongo/webhook")).status, 200);

  await changeMaintenanceMode(db, admin, { action: "end" });
  assert.equal((await requestAs(customer, "/customer/invoices")).headers.get("x-middleware-rewrite"), null);
  assert.equal((await requestAs(customer, "/api/billing")).status, 200);
});
