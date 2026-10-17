import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { ZodError } from "zod";
import { getDatabase } from "@/lib/database/mongodb";
import type { HouseDesignDocument } from "@/lib/database/collections";
import { applyMaintenance, getMaintenanceData, isActiveFinish, MaintenanceError } from "@/lib/server/maintenance";
import { backupCollections, backupPage, startBackup } from "@/lib/server/backup";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryReplSet;
let db: Db;
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const clerk: SessionUser = { id: new ObjectId().toHexString(), name: "Billing Clerk", email: "clerk@example.test", role: "billing-clerk" };
const designId = new ObjectId();
const isStatus = (status: number) => (error: unknown) => error instanceof MaintenanceError && error.status === status;
const design = () => db.collection<HouseDesignDocument>("house_designs").findOne({ _id: designId });

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_maintenance_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_maintenance_tests");
  await Promise.all(["reference_values", "house_types", "house_designs", "audit_logs", "rate_limits"].map((name) => db.collection(name).deleteMany({})));
  await db.collection("reference_values").insertMany(["Standard", "Luxury"].map((value, order) => ({ category: "house-design-finish", value, order, active: true })));
  await db.collection("house_types").insertOne({ heading: "Modern", description: "Clean lines and open planning.", imgSrc: "https://example.test/modern.jpg", order: 0, active: true });
  const now = new Date();
  await db.collection<HouseDesignDocument>("house_designs").insertOne({
    _id: designId, name: "Test design", houseType: "Modern", finish: "Standard", area: 90, rooms: "2 bedrooms", rate: 25000,
    images: ["https://example.test/design.jpg"], notes: "", status: "Published",
    defaultSelections: [],
    customItems: [], createdAt: now, createdBy: new ObjectId(admin.id), createdByName: admin.name, updatedAt: now,
  } as HouseDesignDocument);
});
after(async () => { await db?.client.close(); await mongo?.stop(); });

test("only the Admin can change maintenance records", async () => {
  await assert.rejects(applyMaintenance(db, clerk, { action: "save-finish", value: "Premium", active: true }), isStatus(403));
});

test("renaming a finish or house type carries over to house designs, and retired finishes are no longer offered", async () => {
  await assert.rejects(applyMaintenance(db, admin, { action: "save-exterior-item", item: "Gate", detail: "", quantity: 1, options: [], active: true }), ZodError);
  const data = await getMaintenanceData(db);
  const standard = data.finishes.find((finish) => finish.value === "Standard")!;
  assert.equal(standard.designCount, 1);

  await applyMaintenance(db, admin, { action: "save-finish", id: standard.id, value: "Basic", active: false });
  assert.equal((await design())?.finish, "Basic");
  assert.equal(await isActiveFinish(db, "Basic"), false);
  assert.equal(await isActiveFinish(db, "Luxury"), true);

  await applyMaintenance(db, admin, { action: "save-finish", value: "Premium", active: true });
  assert.deepEqual((await getMaintenanceData(db)).finishes.map((finish) => finish.value), ["Basic", "Luxury", "Premium"]);
  await assert.rejects(applyMaintenance(db, admin, { action: "save-finish", value: "Luxury", active: true }), isStatus(409));

  const modern = (await getMaintenanceData(db)).houseTypes[0];
  await applyMaintenance(db, admin, { action: "save-house-type", id: modern.id, heading: "Contemporary", description: modern.description, imgSrc: modern.imgSrc, active: true });
  assert.equal((await design())?.houseType, "Contemporary");
  await assert.rejects(
    applyMaintenance(db, admin, { action: "save-house-type", heading: "Bad image", description: "A house type with a bad image.", imgSrc: "http://example.test/a.jpg", active: true }),
    ZodError,
  );
});

test("backups page through every lasting collection in Extended JSON and are audited", async () => {
  assert.ok(!backupCollections.includes("rate_limits" as never));
  const { collections } = await startBackup(db, admin);
  assert.ok(collections.some((entry) => entry.name === "reference_values" && entry.count === 2));
  const log = await db.collection("audit_logs").findOne({ action: "Downloaded database backup" });
  assert.equal(log?.actorName, "Admin");

  const page = await backupPage(db, "house_designs");
  assert.equal(page.next, null);
  assert.equal(page.documents.length, 1);
  assert.deepEqual((page.documents[0] as { _id: unknown })._id, { $oid: designId.toHexString() });
});
