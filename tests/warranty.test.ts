import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { ZodError } from "zod";
import { getDatabase } from "@/lib/database/mongodb";
import type { ProjectDocument, ScheduleDocument, UserDocument, WarrantyClaimDocument } from "@/lib/database/collections";
import { manilaDate } from "@/lib/billing";
import { addMonths, daysBetween } from "@/lib/warranty";
import { BillingError } from "@/lib/server/billing";
import { archiveInactiveClients } from "@/lib/server/client-inactivity";
import { changeProjectStatus, listProjects } from "@/lib/server/construction";
import { updateSystemSettings } from "@/lib/server/maintenance";
import {
  changeWarrantyClaim,
  closeRepairedClaims,
  createWarrantyClaim,
  getWarrantyCertificate,
  listWarrantyClaims,
  warrantyOnCompletion,
} from "@/lib/server/warranty";
import { getWarrantyLists, updateWarrantyLists } from "@/lib/server/warranty-settings";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryReplSet;
let db: Db;
const customer: SessionUser = { id: new ObjectId().toHexString(), name: "Ramon Dizon", email: "ramon@example.test", role: "customer" };
const other: SessionUser = { id: new ObjectId().toHexString(), name: "Liza Manalo", email: "liza@example.test", role: "customer" };
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const isError = (status: number) => (error: unknown) => error instanceof BillingError && error.status === status;
const day = 86_400_000;
const photo = "data:image/png;base64,AAAA";

/** A completed project, finished `daysAgo` days ago, with the warranty saved the way completion saves it. */
async function completedProject(daysAgo = 30, owner = customer, months = 12) {
  const completedAt = new Date(Date.now() - daysAgo * day);
  const project: ProjectDocument = {
    _id: new ObjectId(), reference: `PRJ-2026-${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`, customerId: new ObjectId(owner.id),
    name: "Modern Minimalist – Construction", status: "Completed", contractPrice: 2_000_000, completedAt,
    ...warrantyOnCompletion(completedAt, months), createdAt: completedAt, updatedAt: completedAt,
  };
  await db.collection<ProjectDocument>("projects").insertOne(project);
  return project;
}

const report = (projectId: ObjectId, extra = {}) => ({
  projectId: projectId.toHexString(), problemType: "Roof leak", noticedOn: manilaDate(), location: "Master bedroom ceiling",
  description: "Water drips from the ceiling near the window whenever it rains hard.", photos: [photo], ...extra,
});
/** Two days from now at 9:00 AM Manila time, a free slot for a visit. */
const visitTime = (offsetHours = 0) => new Date(`${manilaDate()}T09:00:00+08:00`).getTime() + 2 * day + offsetHours * 3_600_000;
const visit = (offsetHours = 0) => ({ scheduledFor: new Date(visitTime(offsetHours)).toISOString(), durationMinutes: 60 });
const covered = { action: "record-inspection" as const, inspectedOn: manilaDate(), inspectedBy: "Engr. Gina R. Abellar", findings: "Sealant around the roof flashing has gaps.", covered: true, photos: [] };

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_warranty_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_warranty_tests");
  await Promise.all(["users", "projects", "warranty_claims", "schedules", "notifications", "audit_logs", "billing_counters", "system_settings", "cost_estimates", "design_requests"]
    .map((name) => db.collection(name).deleteMany({})));
  const now = new Date();
  await db.collection<UserDocument>("users").insertMany([customer, other, admin].map((actor) => ({
    _id: new ObjectId(actor.id), name: actor.name, email: actor.email, role: actor.role, status: "active", createdAt: now, updatedAt: now,
  })));
});
after(async () => { await db?.client.close(); await mongo?.stop(); });

test("completing a project saves a 1-year warranty that a later change to the length does not move", async () => {
  const now = new Date();
  const projectId = new ObjectId();
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: projectId, reference: "PRJ-2026-000001", customerId: new ObjectId(customer.id), name: "Finished home",
    status: "Active", contractPrice: 1_000_000, createdAt: now, updatedAt: now,
  });
  await changeProjectStatus(db, admin, projectId.toHexString(), { action: "status", status: "Completed" });
  const saved = await db.collection<ProjectDocument>("projects").findOne({ _id: projectId });
  assert.equal(saved?.warrantyMonths, 12);
  assert.equal(saved?.warrantyEndsAt?.toISOString().slice(0, 10), addMonths(manilaDate(saved!.completedAt), 12));
  const notice = await db.collection("notifications").findOne({ userId: new ObjectId(customer.id), kind: "construction-project" });
  assert.match(notice!.body, /under warranty for 1 year, until/);

  await updateSystemSettings(db, admin, { warrantyMonths: 24 });
  const [dto] = await listProjects(db, customer);
  assert.equal(dto.warranty?.months, 12);
  assert.equal(dto.warranty?.endsOn, addMonths(manilaDate(saved!.completedAt), 12));
  assert.equal(dto.warranty?.active, true);
  assert.equal(dto.warranty?.daysLeft, daysBetween(manilaDate(), dto.warranty!.endsOn));
});

test("projects completed before warranties existed get one from their completion date, saved once", async () => {
  const completedAt = new Date(Date.now() - 100 * day);
  const projectId = new ObjectId();
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: projectId, reference: "PRJ-OLD", customerId: new ObjectId(customer.id), name: "Older home",
    status: "Completed", contractPrice: 1, completedAt, createdAt: completedAt, updatedAt: completedAt,
  });
  await listProjects(db, admin);
  const saved = await db.collection<ProjectDocument>("projects").findOne({ _id: projectId });
  assert.equal(saved?.warrantyEndsAt?.toISOString().slice(0, 10), addMonths(manilaDate(completedAt), 12));
  // Unfinished projects have no warranty yet.
  const active = new ObjectId();
  await db.collection<ProjectDocument>("projects").insertOne({ _id: active, reference: "PRJ-NOW", customerId: new ObjectId(customer.id), name: "Ongoing", status: "Active", contractPrice: 1, createdAt: completedAt, updatedAt: completedAt });
  assert.equal((await listProjects(db, customer)).find((project) => project.id === active.toHexString())?.warranty, null);
});

test("only the homeowner can report, with a listed problem type, a photo, and a sensible date, while the warranty runs", async () => {
  const project = await completedProject();
  await assert.rejects(createWarrantyClaim(db, other, report(project._id)), isError(404));
  await assert.rejects(createWarrantyClaim(db, admin, report(project._id)), isError(403));
  await assert.rejects(createWarrantyClaim(db, customer, report(project._id, { problemType: "Swimming pool" })), isError(400));
  await assert.rejects(createWarrantyClaim(db, customer, report(project._id, { photos: [] })), ZodError);
  await assert.rejects(createWarrantyClaim(db, customer, report(project._id, { noticedOn: manilaDate(new Date(Date.now() + 2 * day)) })), isError(400));
  await assert.rejects(createWarrantyClaim(db, customer, report(project._id, { noticedOn: manilaDate(new Date(Date.now() - 60 * day)) })), isError(400));

  const claim = await createWarrantyClaim(db, customer, report(project._id));
  assert.match(claim.reference, /^WC-\d{4}-000001$/);
  assert.equal(claim.status, "Submitted");
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(admin.id), kind: "warranty-claim" }), 1);

  // Hidden problem types are no longer offered.
  const lists = await getWarrantyLists(db);
  await updateWarrantyLists(db, admin, { ...lists, problemTypes: lists.problemTypes.map((type) => ({ ...type, shown: type.name !== "Plumbing" })) });
  await assert.rejects(createWarrantyClaim(db, customer, report(project._id, { problemType: "Plumbing" })), isError(400));
  assert.ok(!(await listWarrantyClaims(db, customer)).problemTypes.includes("Plumbing"));

  const expired = await completedProject(400);
  await assert.rejects(createWarrantyClaim(db, customer, report(expired._id)), (error: unknown) => isError(409)(error) && /warranty for this house ended/.test((error as Error).message));
});

test("a covered claim goes from inspection to repair to the homeowner confirming it is fixed", async () => {
  const project = await completedProject();
  const claim = await createWarrantyClaim(db, customer, report(project._id));
  await assert.rejects(changeWarrantyClaim(db, customer, claim.id, { action: "schedule-inspection", ...visit() }), isError(403));
  await assert.rejects(changeWarrantyClaim(db, admin, claim.id, covered), isError(409));

  const inspecting = await changeWarrantyClaim(db, admin, claim.id, { action: "schedule-inspection", ...visit() });
  assert.equal(inspecting.status, "Inspection scheduled");
  const meeting = await db.collection<ScheduleDocument>("schedules").findOne({ eventType: "Client meeting", clientId: new ObjectId(customer.id) });
  assert.match(meeting!.title, /Warranty inspection/);
  assert.equal(meeting?.status, "Scheduled");
  // Moving the visit cancels the old calendar entry instead of clashing with it.
  await changeWarrantyClaim(db, admin, claim.id, { action: "schedule-inspection", ...visit(1) });
  assert.equal(await db.collection("schedules").countDocuments({ status: "Scheduled" }), 1);

  const isCovered = await changeWarrantyClaim(db, admin, claim.id, covered);
  assert.equal(isCovered.status, "Covered");
  assert.equal(await db.collection("schedules").countDocuments({ status: "Completed" }), 1);
  const repairing = await changeWarrantyClaim(db, admin, claim.id, { action: "schedule-repair", ...visit(3) });
  assert.equal(repairing.status, "Repair scheduled");
  await assert.rejects(changeWarrantyClaim(db, customer, claim.id, { action: "confirm-repair" }), isError(409));
  const repaired = await changeWarrantyClaim(db, admin, claim.id, { action: "mark-repaired", notes: "Resealed the flashing." });
  assert.equal(repaired.status, "Repaired");
  assert.ok(repaired.closesOn);
  await assert.rejects(changeWarrantyClaim(db, admin, claim.id, { action: "confirm-repair" }), isError(403));

  const closed = await changeWarrantyClaim(db, customer, claim.id, { action: "confirm-repair" });
  assert.equal(closed.status, "Closed");
  assert.equal(closed.closedBy, "customer");
  const titles = (await db.collection("notifications").find({ userId: new ObjectId(customer.id), kind: "warranty-claim" }).sort({ _id: 1 }).toArray()).map((note) => note.title);
  assert.deepEqual(titles, ["Warranty inspection scheduled", "Warranty inspection moved", "Your reported problem is covered", "Warranty repair scheduled", "Repair finished — confirm it's fixed"]);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: /^warranty-claim\./ }), 7);
});

test("a problem that is not covered needs a listed reason and ends the claim without a repair", async () => {
  const project = await completedProject();
  const claim = await createWarrantyClaim(db, customer, report(project._id));
  await changeWarrantyClaim(db, admin, claim.id, { action: "schedule-inspection", ...visit() });
  const notCovered = { ...covered, covered: false };
  await assert.rejects(changeWarrantyClaim(db, admin, claim.id, notCovered), isError(400));
  await assert.rejects(changeWarrantyClaim(db, admin, claim.id, { ...notCovered, reason: "Bad luck" }), isError(400));
  const result = await changeWarrantyClaim(db, admin, claim.id, { ...notCovered, reason: "Changes or repairs made by the owner or other contractors" });
  assert.equal(result.status, "Not covered");
  assert.equal(result.result?.reason, "Changes or repairs made by the owner or other contractors");
  await assert.rejects(changeWarrantyClaim(db, admin, claim.id, { action: "schedule-repair", ...visit(3) }), isError(409));
  const note = await db.collection("notifications").findOne({ userId: new ObjectId(customer.id), title: "Your reported problem is not covered" });
  assert.match(note!.body, /Changes or repairs made by the owner/);
});

test("repaired claims close by themselves after the set days, and customers only see their own", async () => {
  const project = await completedProject();
  const claim = await createWarrantyClaim(db, customer, report(project._id));
  await changeWarrantyClaim(db, admin, claim.id, { action: "schedule-inspection", ...visit() });
  await changeWarrantyClaim(db, admin, claim.id, covered);
  await changeWarrantyClaim(db, admin, claim.id, { action: "schedule-repair", ...visit(3) });
  await changeWarrantyClaim(db, admin, claim.id, { action: "mark-repaired", notes: "" });

  assert.deepEqual(await closeRepairedClaims(db, new Date(Date.now() + 6 * day)), { closed: 0 });
  assert.deepEqual(await closeRepairedClaims(db, new Date(Date.now() + 7 * day + 60_000)), { closed: 1 });
  const stored = await db.collection<WarrantyClaimDocument>("warranty_claims").findOne({ _id: new ObjectId(claim.id) });
  assert.equal(stored?.status, "Closed");
  assert.equal(stored?.closedBy, "automatic");

  assert.equal((await listWarrantyClaims(db, customer)).claims.length, 1);
  assert.equal((await listWarrantyClaims(db, other)).claims.length, 0);
  const listed = (await listWarrantyClaims(db, admin)).claims[0];
  assert.equal(listed.photoCount, 1);
  assert.equal(listed.photos, undefined);
});

test("the certificate lists the shown problem types and the not-covered reasons", async () => {
  const project = await completedProject();
  await assert.rejects(getWarrantyCertificate(db, other, project._id.toHexString()), isError(404));
  const certificate = await getWarrantyCertificate(db, customer, project._id.toHexString());
  assert.equal(certificate.number, project.reference.replace("PRJ-", "WRC-"));
  assert.equal(certificate.endsOn, project.warrantyEndsAt!.toISOString().slice(0, 10));
  assert.ok(certificate.covers.includes("Roof leak"));
  assert.ok(!certificate.covers.includes("Other"));
  assert.equal(certificate.notCovered.length, 4);
});

test("the warranty lists need different names and at least one shown problem type", async () => {
  const lists = await getWarrantyLists(db);
  await assert.rejects(updateWarrantyLists(db, admin, { ...lists, problemTypes: [{ name: "Leak", shown: true }, { name: "leak", shown: true }] }), ZodError);
  await assert.rejects(updateWarrantyLists(db, admin, { ...lists, problemTypes: lists.problemTypes.map((type) => ({ ...type, shown: false })) }), ZodError);
  await assert.rejects(updateWarrantyLists(db, customer, lists));
  const saved = await updateWarrantyLists(db, admin, { ...lists, problemTypes: [...lists.problemTypes, { name: "Water heater", shown: true }] });
  assert.equal(saved.changedBy, "Admin");
  assert.ok(saved.problemTypes.some((type) => type.name === "Water heater"));
});

test("homeowners stay active while their warranty runs or a claim is open, then are archived after it ends", async () => {
  const project = await completedProject(10);
  const warrantyOver = project.warrantyEndsAt!.getTime() + day;
  // Thirty days after completion used to archive the client; the warranty keeps them able to report a problem.
  assert.deepEqual(await archiveInactiveClients(db, new Date(Date.now() + 40 * day)), { noticed: 0, archived: 0 });
  // An open claim keeps them active even after the warranty ends.
  const claim = await createWarrantyClaim(db, customer, report(project._id));
  assert.deepEqual(await archiveInactiveClients(db, new Date(warrantyOver + 40 * day)), { noticed: 0, archived: 0 });
  await db.collection("warranty_claims").updateOne({ _id: new ObjectId(claim.id) }, { $set: { status: "Closed" } });
  assert.deepEqual(await archiveInactiveClients(db, new Date(warrantyOver + 24 * day)), { noticed: 1, archived: 0 });
});
