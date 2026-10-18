import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { ZodError } from "zod";
import { getDatabase } from "@/lib/database/mongodb";
import type { DesignRequestDocument, HouseDesignDocument, InvoiceDocument, PaymentDocument, ProjectDocument, UserDocument } from "@/lib/database/collections";
import { BillingError, changeInvoice, createInvoice, getBillingData, reviewPayment, submitPayment } from "@/lib/server/billing";
import { changeEstimate, changeProjectStatus, createConstructionRequest, getEstimate, listEstimates, listProjects } from "@/lib/server/construction";
import { syncCompletedProjectDesigns } from "@/lib/server/completed-project-designs";
import { defaultScheduleTemplate } from "@/lib/construction";
import { listPaymentDues } from "@/lib/server/payment-dues";
import { removeVatFromEstimates } from "@/lib/server/vat-cleanup";
import { archiveInactiveClients } from "@/lib/server/client-inactivity";
import { setClientArchived } from "@/lib/server/clients";
import { manilaDate } from "@/lib/billing";
import type { ConstructionProjectDto, CostEstimateDto } from "@/types/construction";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryReplSet;
let db: Db;
const clerk: SessionUser = { id: new ObjectId().toHexString(), name: "Billing Clerk", email: "clerk@example.test", role: "billing-clerk" };
const customer: SessionUser = { id: new ObjectId().toHexString(), name: "Test Customer", email: "customer@example.test", role: "customer" };
const other: SessionUser = { id: new ObjectId().toHexString(), name: "Other Customer", email: "other@example.test", role: "customer" };
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const isError = (status: number) => (error: unknown) => error instanceof BillingError && error.status === status;
const address = { provinceCode: "0401000000", cityCode: "0401003000", barangayCode: "0401003001", barangay: "Baclaran", street: "123 Example Street", postalCode: "4213" };

function daysFromToday(days: number) {
  const value = new Date(`${manilaDate()}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const startDate = () => daysFromToday(30);
const neededBy = () => daysFromToday(330);

/** A completed design with its fee invoiced; `paid` verifies the full fee so the design unlocks. */
async function designFixture(owner: SessionUser, paid: boolean) {
  const now = new Date();
  const id = new ObjectId();
  await db.collection<DesignRequestDocument>("design_requests").insertOne({
    _id: id, customerId: new ObjectId(owner.id), floorArea: 120, rooms: "3 bedrooms, 2 bathrooms",
    notes: "Courtyard home", status: "Completed", completedDesignImages: ["data:image/png;base64,AAAA"], completedAt: now, createdAt: now, updatedAt: now,
  });
  const invoiceId = new ObjectId();
  await db.collection<InvoiceDocument>("invoices").insertOne({
    _id: invoiceId, invoiceNumber: `INV-FEE-${id.toHexString().slice(-6)}`, customerId: new ObjectId(owner.id), designRequestId: id,
    label: "House design fee", progressPercentage: 0, amount: 5000, dueDate: new Date("2099-12-31T00:00:00.000Z"), status: paid ? "Paid" : "Sent",
    createdAt: now, updatedAt: now,
  });
  if (paid) {
    await db.collection<PaymentDocument>("payments").insertOne({
      _id: new ObjectId(), reference: `PAY-FEE-${id.toHexString().slice(-6)}`, customerId: new ObjectId(owner.id), invoiceId, amount: 5000,
      method: "Cash", status: "Verified", paidAt: now, createdAt: now, verifiedAt: now,
    });
  }
  return id.toHexString();
}
const requestInput = (designRequestId: string, extra = {}) => ({
  designRequestId, preferredStartDate: startDate(), neededBy: neededBy(), siteAddress: address, notes: "Corner lot near the highway", ...extra,
});
const lines = (unitPrice = 6_000_000) => [{ item: "Base construction", description: "Turnkey works", unit: "lot", quantity: 1, unitPrice }];
const savePayload = (extra = {}) => ({
  action: "save" as const, lineItems: lines(), scheduleTemplate: defaultScheduleTemplate(startDate(), neededBy()), adminNotes: "Prices valid for 30 days", ...extra,
});

async function requestedEstimate(owner: SessionUser = customer) {
  const designId = await designFixture(owner, true);
  return createConstructionRequest(db, owner, requestInput(designId));
}
async function sentEstimate(unitPrice = 6_000_000) {
  const estimate = await requestedEstimate();
  await changeEstimate(db, admin, estimate.id, savePayload({ lineItems: lines(unitPrice) }));
  return (await changeEstimate(db, admin, estimate.id, { action: "send" })).estimate;
}
async function acceptedProject(downpaymentPercent = 30, unitPrice = 6_000_000) {
  const estimate = await sentEstimate(unitPrice);
  const { projectId } = await changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent });
  assert.ok(projectId);
  return { estimate, projectId };
}
async function projectDto(id: string, actor: SessionUser = clerk): Promise<ConstructionProjectDto> {
  const project = (await listProjects(db, actor)).find((item) => item.id === id);
  assert.ok(project);
  return project;
}
function payInput(invoiceId: string, amount: number) {
  return { invoiceId, amount, method: "Bank transfer", transactionReference: randomUUID(), paidAt: manilaDate(), submissionKey: randomUUID() };
}
async function billMilestone(project: ConstructionProjectDto, index: number, issue = true) {
  const milestone = project.milestones[index];
  const invoiceId = milestone.invoice?.id ?? await createInvoice(db, clerk, {
    projectId: project.id, milestoneId: milestone.id, label: milestone.label, basis: "Completed stage per site inspection report",
    progressPercentage: milestone.percentage, amount: milestone.amount, dueDate: "2099-12-31",
  });
  if (issue) await changeInvoice(db, clerk, invoiceId, { action: "issue" });
  return invoiceId;
}
async function payInFull(project: ConstructionProjectDto, index: number) {
  const invoiceId = await billMilestone(project, index);
  const paymentId = await submitPayment(db, customer, payInput(invoiceId, project.milestones[index].amount));
  await reviewPayment(db, clerk, paymentId, { action: "verify" });
  return { invoiceId, paymentId };
}

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_construction_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_construction_tests");
  await Promise.all(["house_designs", "exterior_items", "design_requests", "users", "projects", "invoices", "payments", "approvals", "audit_logs", "notifications", "billing_counters", "cost_estimates", "schedules"]
    .map((name) => db.collection(name).deleteMany({})));
  const now = new Date();
  await db.collection<UserDocument>("users").insertMany([clerk, customer, other, admin].map((actor) => ({
    _id: new ObjectId(actor.id), name: actor.name, email: actor.email, role: actor.role, status: "active", createdAt: now, updatedAt: now,
  })));
});
after(async () => { await db?.client.close(); await mongo?.stop(); });

test("estimates saved with VAT drop it, unless billing already started on the accepted project", async () => {
  const open = await sentEstimate();
  const unbilled = await acceptedProject();
  const billed = await acceptedProject();
  // Simulate records saved before G4 Builders became VAT-exempt.
  const withVat = { subtotal: 6_000_000, vatRate: 0.12, vat: 720_000, total: 6_720_000 };
  await db.collection("cost_estimates").updateMany({}, { $set: withVat });
  for (const { projectId } of [unbilled, billed]) {
    const project = await db.collection<ProjectDocument>("projects").findOne({ _id: new ObjectId(projectId) });
    const schedule = project!.paymentSchedule!.map((milestone, index) => ({ ...milestone, amount: [2_016_000, 2_016_000, 2_016_000, 672_000][index] }));
    await db.collection<ProjectDocument>("projects").updateOne({ _id: project!._id }, { $set: { contractPrice: 6_720_000, subtotal: 6_000_000, vat: 720_000, paymentSchedule: schedule } });
    await db.collection<InvoiceDocument>("invoices").updateMany({ projectId: project!._id }, { $set: { amount: 2_016_000 } });
  }
  const billedProject = await db.collection<ProjectDocument>("projects").findOne({ _id: new ObjectId(billed.projectId) });
  await changeInvoice(db, clerk, billedProject!.paymentSchedule![0].invoiceId!.toHexString(), { action: "issue" });

  await removeVatFromEstimates(db);
  const estimates = await listEstimates(db, admin);
  const reopened = estimates.find((estimate) => estimate.id === open.id)!;
  assert.deepEqual([reopened.subtotal, reopened.total], [6_000_000, 6_000_000]);
  assert.equal((await db.collection("cost_estimates").findOne({ _id: new ObjectId(open.id) }))?.vat, undefined);
  const freed = estimates.find((estimate) => estimate.id === unbilled.estimate.id)!;
  assert.equal(freed.total, 6_000_000);
  const unbilledProject = await projectDto(unbilled.projectId);
  assert.equal(unbilledProject.contractPrice, 6_000_000);
  assert.deepEqual(unbilledProject.milestones.map((milestone) => milestone.amount), [1_800_000, 1_800_000, 1_800_000, 600_000]);
  assert.equal(unbilledProject.milestones[0].invoice?.amount, 1_800_000);
  const event = await db.collection("schedules").findOne({ projectId: new ObjectId(unbilled.projectId), milestoneId: unbilledProject.milestones[0].id });
  assert.equal(event?.expectedAmount, 1_800_000);
  // An issued invoice means the customer was already billed on the agreed total.
  const kept = estimates.find((estimate) => estimate.id === billed.estimate.id)!;
  assert.equal(kept.total, 6_720_000);
  assert.equal((await projectDto(billed.projectId)).contractPrice, 6_720_000);
  // Accepting the open estimate uses the VAT-free total.
  const { projectId } = await changeEstimate(db, customer, open.id, { action: "accept", downpaymentPercent: 30 });
  assert.equal((await projectDto(projectId!)).contractPrice, 6_000_000);
});

test("clients are warned, then archived and disabled 30 days after their last project completes with nothing open", async () => {
  const completedAt = new Date("2026-01-01T02:00:00.000Z");
  const at = (days: number) => new Date(completedAt.getTime() + days * 86_400_000);
  const projectId = new ObjectId();
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: projectId, reference: "PRJ-DONE", name: "Finished home", customerId: new ObjectId(customer.id),
    status: "Completed", contractPrice: 1_000_000, completedAt, createdAt: completedAt, updatedAt: completedAt,
  });
  const user = () => db.collection<UserDocument>("users").findOne({ _id: new ObjectId(customer.id) });

  assert.deepEqual(await archiveInactiveClients(db, at(10)), { noticed: 0, archived: 0 });
  assert.deepEqual(await archiveInactiveClients(db, at(24)), { noticed: 1, archived: 0 });
  assert.deepEqual(await archiveInactiveClients(db, at(25)), { noticed: 0, archived: 0 });
  assert.match((await db.collection("notifications").findOne({ kind: "client-inactivity-notice" }))!.title, /will be archived on February 1, 2026/); // 7 days after the day-24 notice

  // An unpaid invoice keeps the client active.
  const invoiceId = new ObjectId();
  await db.collection<InvoiceDocument>("invoices").insertOne({
    _id: invoiceId, invoiceNumber: "INV-OPEN", customerId: new ObjectId(customer.id), projectId, label: "Retention",
    progressPercentage: 100, amount: 5000, dueDate: at(40), status: "Sent", createdAt: completedAt, updatedAt: completedAt,
  });
  assert.equal((await archiveInactiveClients(db, at(31))).archived, 0);
  await db.collection("invoices").deleteOne({ _id: invoiceId });

  assert.equal((await archiveInactiveClients(db, at(31))).archived, 1);
  const archived = await user();
  assert.equal(archived?.status, "disabled");
  assert.ok(archived?.clientArchivedAt && archived.autoArchivedAt);
  assert.equal(await db.collection("notifications").countDocuments({ kind: "client-auto-archived", userId: new ObjectId(admin.id) }), 1);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "client.auto-archived" }), 1);

  // Unarchiving restores sign-in and restarts the 30-day count.
  await setClientArchived(db, admin, customer.id, { archived: false });
  const restored = await user();
  assert.equal(restored?.status, "active");
  assert.equal(restored?.clientArchivedAt, undefined);
  const reactivatedAt = restored!.reactivatedAt!;
  const afterReactivation = (days: number) => new Date(reactivatedAt.getTime() + days * 86_400_000);
  assert.deepEqual(await archiveInactiveClients(db, afterReactivation(5)), { noticed: 0, archived: 0 });
  // A missed notice window still gets a full 7-day warning before archiving.
  assert.deepEqual(await archiveInactiveClients(db, afterReactivation(31)), { noticed: 1, archived: 0 });
  assert.deepEqual(await archiveInactiveClients(db, afterReactivation(37)), { noticed: 0, archived: 0 });
  assert.deepEqual(await archiveInactiveClients(db, afterReactivation(38)), { noticed: 0, archived: 1 });
});

test("clients already past 30 days when the job first runs are warned, not archived on the spot", async () => {
  const completedAt = new Date("2026-01-01T02:00:00.000Z");
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: new ObjectId(), reference: "PRJ-OLD", name: "Long done", customerId: new ObjectId(customer.id),
    status: "Completed", contractPrice: 1, completedAt, createdAt: completedAt, updatedAt: completedAt,
  });
  const firstRun = new Date("2026-06-01T00:30:00.000Z");
  assert.deepEqual(await archiveInactiveClients(db, firstRun), { noticed: 1, archived: 0 });
  assert.match((await db.collection("notifications").findOne({ kind: "client-inactivity-notice" }))!.title, /June 8, 2026/);
  assert.equal((await db.collection<UserDocument>("users").findOne({ _id: new ObjectId(customer.id) }))?.status, "active");
  assert.deepEqual(await archiveInactiveClients(db, new Date(firstRun.getTime() + 6 * 86_400_000)), { noticed: 0, archived: 0 });
  assert.deepEqual(await archiveInactiveClients(db, new Date(firstRun.getTime() + 7 * 86_400_000)), { noticed: 0, archived: 1 });
});

test("clients with an unfinished project are never archived for inactivity", async () => {
  const old = new Date("2026-01-01T00:00:00.000Z");
  await db.collection<ProjectDocument>("projects").insertMany([
    { _id: new ObjectId(), reference: "PRJ-A", name: "Done", customerId: new ObjectId(customer.id), status: "Completed", contractPrice: 1, completedAt: old, createdAt: old, updatedAt: old },
    { _id: new ObjectId(), reference: "PRJ-B", name: "Ongoing", customerId: new ObjectId(customer.id), status: "Active", contractPrice: 1, createdAt: old, updatedAt: old },
  ]);
  assert.deepEqual(await archiveInactiveClients(db, new Date("2026-06-01T00:00:00.000Z")), { noticed: 0, archived: 0 });
  assert.equal((await db.collection<UserDocument>("users").findOne({ _id: new ObjectId(customer.id) }))?.status, "active");
});

test("the admin calendar lists every customer payment date with its live status", async () => {
  const { projectId } = await acceptedProject(30);
  let project = await projectDto(projectId);
  // The design fee the fixture already paid shows too, separate from the construction milestones.
  const all = await listPaymentDues(db);
  assert.deepEqual(all.filter((due) => due.kind === "Design fee").map((due) => due.status), ["Paid"]);
  const projectDues = async () => (await listPaymentDues(db)).filter((due) => due.projectName.startsWith(project.reference));
  let dues = await projectDues();
  assert.equal(dues.length, project.milestones.length);
  assert.ok(dues.every((due) => due.status === "Upcoming" && !due.invoiceNumber && due.clientName === customer.name));
  assert.equal(dues.find((due) => due.kind === "Downpayment")?.amount, project.milestones[0].amount);
  assert.deepEqual(dues.map((due) => due.dueDate), [...dues.map((due) => due.dueDate)].sort());

  await payInFull(project, 0);
  project = await projectDto(projectId);
  dues = await projectDues();
  const downpayment = dues.find((due) => due.kind === "Downpayment");
  assert.equal(downpayment?.status, "Paid");
  assert.equal(downpayment?.invoiceNumber, project.milestones[0].invoice?.number);
  assert.equal(downpayment?.balance, 0);

  const progress = await billMilestone(project, 1);
  await db.collection<InvoiceDocument>("invoices").updateOne({ _id: new ObjectId(progress) }, { $set: { dueDate: new Date("2020-01-01T00:00:00.000Z") } });
  dues = await projectDues();
  assert.equal(dues.find((due) => due.label === project.milestones[1].label)?.status, "Overdue");
  assert.equal(dues.filter((due) => due.status === "Upcoming").length, project.milestones.length - 2);
});

test("blueprint-flow designs open the free estimate once the customer approves them, and the clerk bills the blueprint first", async () => {
  const now = new Date();
  const id = new ObjectId();
  await db.collection<DesignRequestDocument>("design_requests").insertOne({
    _id: id, customerId: new ObjectId(customer.id), floorArea: 120, rooms: "3 bedrooms, 2 bathrooms",
    notes: "Courtyard home", status: "Changes requested", currentVersion: 1, createdAt: now, updatedAt: now,
  });
  await assert.rejects(createConstructionRequest(db, customer, requestInput(id.toHexString())), isError(409));
  await db.collection("design_requests").updateOne({ _id: id }, { $set: { status: "Design approved", designApprovedAt: now } });
  const estimate = await createConstructionRequest(db, customer, requestInput(id.toHexString()));
  assert.equal(await db.collection("payments").countDocuments(), 0);
  await changeEstimate(db, admin, estimate.id, savePayload());
  await changeEstimate(db, admin, estimate.id, { action: "send" });
  const { projectId } = await changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent: 30 });
  assert.ok(projectId);
  assert.equal(await db.collection("notifications").countDocuments({ kind: "blueprint-fee" }), 1);
  assert.equal(await db.collection("notifications").countDocuments({ title: "Downpayment invoice ready to issue" }), 0);
  const project = await projectDto(projectId);
  const downpaymentInvoice = project.milestones[0].invoice?.id;
  assert.ok(downpaymentInvoice);
  await assert.rejects(changeInvoice(db, clerk, downpaymentInvoice, { action: "issue" }), isError(409));
});

test("only the owner of an unlocked design can request construction, and each design allows one request", async () => {
  const locked = await designFixture(customer, false);
  await assert.rejects(createConstructionRequest(db, customer, requestInput(locked)), isError(409));
  const unlocked = await designFixture(customer, true);
  const foreign = await designFixture(other, true);
  await assert.rejects(createConstructionRequest(db, customer, requestInput(foreign)), isError(404));
  for (const actor of [admin, clerk]) await assert.rejects(createConstructionRequest(db, actor, requestInput(unlocked)), isError(403));
  await assert.rejects(createConstructionRequest(db, customer, requestInput(unlocked, { preferredStartDate: manilaDate() })), isError(400));
  await assert.rejects(createConstructionRequest(db, customer, requestInput(unlocked, { neededBy: startDate() })), isError(400));
  await assert.rejects(createConstructionRequest(db, customer, requestInput(unlocked, { siteAddress: { ...address, cityCode: "0401014000" } })), ZodError);
  await assert.rejects(createConstructionRequest(db, customer, requestInput(unlocked, { siteAddress: { ...address, province: "Forged" } })), ZodError);
  assert.equal(await db.collection("cost_estimates").countDocuments(), 0);

  const estimate = await createConstructionRequest(db, customer, requestInput(unlocked));
  assert.equal(estimate.status, "Requested");
  assert.match(estimate.reference, /^EST-\d{4}-\d{6}$/);
  assert.equal(estimate.preferredStartDate, startDate());
  assert.equal(estimate.designLabel, "120 sqm · 3 bedrooms, 2 bathrooms");
  assert.ok(estimate.siteAddress.includes("Balayan"));
  const duplicates = await Promise.allSettled([createConstructionRequest(db, customer, requestInput(unlocked)), createConstructionRequest(db, customer, requestInput(unlocked))]);
  assert.ok(duplicates.every((result) => result.status === "rejected" && isError(409)(result.reason)));
  assert.equal(await db.collection("cost_estimates").countDocuments(), 1);
  const notice = await db.collection("notifications").findOne({ kind: "construction-request" });
  assert.equal(notice?.userId.toHexString(), admin.id);
  assert.equal(notice?.href, `/admin/cost-estimates?estimate=${estimate.id}`);
});

test("admin saves and sends a validated estimate using the default schedule", async () => {
  const estimate = await requestedEstimate();
  const defaults = defaultScheduleTemplate(startDate(), neededBy());
  assert.deepEqual(defaults.map((row) => row.percentage), [30, 30, 30, 10]);
  assert.equal(defaults[0].targetDate, startDate());
  assert.equal(defaults[3].targetDate, neededBy());

  await assert.rejects(changeEstimate(db, customer, estimate.id, savePayload()), isError(403));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "accept", downpaymentPercent: 30 }), isError(403));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "send" }), isError(409));
  const invalid = [
    savePayload({ lineItems: [] }),
    savePayload({ lineItems: [{ ...lines()[0], quantity: 0 }] }),
    savePayload({ lineItems: [{ ...lines()[0], unitPrice: 10.005 }] }),
    savePayload({ lineItems: [{ ...lines()[0], item: "" }] }),
    savePayload({ scheduleTemplate: defaultScheduleTemplate(startDate(), neededBy()).slice(0, 1) }),
    savePayload({ scheduleTemplate: defaultScheduleTemplate(startDate(), neededBy()).map((row) => ({ ...row, targetDate: "June 1" })) }),
    savePayload({ adminNotes: "x".repeat(4001) }),
  ];
  for (const payload of invalid) await assert.rejects(changeEstimate(db, admin, estimate.id, payload), ZodError);
  await assert.rejects(changeEstimate(db, admin, estimate.id, savePayload({ lineItems: lines(2_000_000_000) })), ZodError);

  // The draft is saved even with an unfinished schedule; sending enforces the rules.
  const template = defaultScheduleTemplate(startDate(), neededBy());
  await changeEstimate(db, admin, estimate.id, savePayload({ scheduleTemplate: template.map((row, index) => (index === 3 ? { ...row, percentage: 20 } : row)) }));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "send" }), isError(400));
  await changeEstimate(db, admin, estimate.id, savePayload({ scheduleTemplate: template.map((row, index) => (index === 0 ? { ...row, percentage: 20 } : row)) }));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "send" }), isError(400));
  await changeEstimate(db, admin, estimate.id, savePayload({ scheduleTemplate: template.map((row) => ({ ...row, targetDate: "" })) }));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "send" }), isError(400));
  await changeEstimate(db, admin, estimate.id, savePayload({ scheduleTemplate: template.map((row, index) => (index === 0 ? { ...row, targetDate: daysFromToday(-1) } : row)) }));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "send" }), isError(400));
  await changeEstimate(db, admin, estimate.id, savePayload({ lineItems: lines(0) }));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "send" }), isError(400));

  const saved = (await changeEstimate(db, admin, estimate.id, savePayload())).estimate;
  assert.equal(saved.status, "Draft");
  assert.equal(saved.subtotal, 6_000_000);
  assert.equal(saved.total, 6_000_000);
  assert.equal((await db.collection("cost_estimates").findOne({ _id: new ObjectId(estimate.id) }))?.vat, undefined);
  const sent = (await changeEstimate(db, admin, estimate.id, { action: "send" })).estimate;
  assert.equal(sent.status, "Sent");
  assert.ok(sent.sentAt);
  await assert.rejects(changeEstimate(db, admin, estimate.id, savePayload()), isError(409));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "send" }), isError(409));
  assert.equal((await db.collection("notifications").findOne({ userId: new ObjectId(customer.id), kind: "construction-estimate" }))?.href, `/customer/dream-house?estimate=${estimate.id}`);
});

test("customers never see line items before the estimate is sent, and only their own estimates", async () => {
  const estimate = await requestedEstimate();
  const hiddenView = (dto: CostEstimateDto) => {
    assert.deepEqual(dto.lineItems, []);
    assert.deepEqual(dto.scheduleTemplate, []);
    assert.equal(dto.total, 0);
    assert.equal(dto.subtotal, 0);
  };
  hiddenView(await getEstimate(db, customer, estimate.id));
  await changeEstimate(db, admin, estimate.id, savePayload());
  hiddenView(await getEstimate(db, customer, estimate.id));
  hiddenView((await listEstimates(db, customer))[0]);
  assert.equal((await getEstimate(db, admin, estimate.id)).total, 6_000_000);
  await assert.rejects(getEstimate(db, other, estimate.id), isError(404));
  assert.deepEqual(await listEstimates(db, other), []);
  await assert.rejects(listEstimates(db, clerk), isError(403));

  await changeEstimate(db, admin, estimate.id, { action: "send" });
  const visible = await getEstimate(db, customer, estimate.id);
  assert.equal(visible.total, 6_000_000);
  assert.equal(visible.lineItems.length, 1);

  // A revision request hides the BOQ again until the admin resends it.
  await assert.rejects(changeEstimate(db, other, estimate.id, { action: "request-revision", reason: "Please lower the price" }), isError(404));
  await assert.rejects(changeEstimate(db, customer, estimate.id, { action: "request-revision", reason: "no" }), ZodError);
  const revision = (await changeEstimate(db, customer, estimate.id, { action: "request-revision", reason: "Please lower the roofing cost" })).estimate;
  assert.equal(revision.status, "Revision requested");
  assert.equal(revision.revisionNote, "Please lower the roofing cost");
  hiddenView(revision);
  await assert.rejects(changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent: 30 }), isError(409));
  assert.equal((await db.collection("notifications").findOne({ kind: "construction-revision" }))?.userId.toHexString(), admin.id);
  await changeEstimate(db, admin, estimate.id, savePayload({ lineItems: lines(5_000_000) }));
  const resent = (await changeEstimate(db, admin, estimate.id, { action: "send" })).estimate;
  assert.equal(resent.status, "Sent");
  assert.equal(resent.revisionNote, null);
  assert.equal(resent.total, 5_000_000);
});

test("accepting at 30% creates the project, a Draft downpayment invoice, and payment-due events", async () => {
  const { estimate, projectId } = await acceptedProject(30);
  const project = await projectDto(projectId);
  assert.equal(project.status, "Awaiting downpayment");
  assert.equal(project.name, "120 sqm · 3 bedrooms, 2 bathrooms – Construction");
  assert.match(project.reference, /^PRJ-\d{4}-\d{6}$/);
  assert.equal(project.contractPrice, 6_000_000);
  assert.equal(project.subtotal, 6_000_000);
  assert.equal(project.estimateId, estimate.id);
  assert.equal(project.downpaymentPercent, 30);
  assert.equal(project.startDate, startDate());
  assert.equal(project.neededBy, neededBy());
  assert.deepEqual(project.milestones.map((milestone) => milestone.amount), [1_800_000, 1_800_000, 1_800_000, 600_000]);
  assert.deepEqual(project.milestones.map((milestone) => milestone.isDownpayment), [true, false, false, false]);
  assert.equal(project.milestones[0].invoice?.status, "Draft");
  assert.equal(project.milestones[0].invoice?.amount, 1_800_000);
  assert.equal(project.milestones[0].status, "Invoiced");
  assert.equal(project.nextMilestone?.id, project.milestones[0].id);
  assert.equal(project.paid, 0);

  const invoices = await db.collection<InvoiceDocument>("invoices").find({ projectId: new ObjectId(projectId) }).toArray();
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].status, "Draft");
  assert.equal(invoices[0].milestoneId, project.milestones[0].id);
  assert.ok(invoices[0].basis?.includes(estimate.reference));
  assert.equal(invoices[0].dueDate.toISOString().slice(0, 10), daysFromToday(7));

  const events = await db.collection("schedules").find({ projectId: new ObjectId(projectId) }).sort({ scheduledFor: 1 }).toArray();
  assert.equal(events.length, 4);
  assert.ok(events.every((event) => event.eventType === "Payment due" && event.paymentStatus === "Expected" && event.status === "Scheduled"));
  assert.equal(events[0].scheduledFor.toISOString(), `${startDate()}T01:00:00.000Z`);
  assert.equal(events[0].expectedAmount, 1_800_000);

  const accepted = await getEstimate(db, customer, estimate.id);
  assert.equal(accepted.status, "Accepted");
  assert.equal(accepted.projectId, projectId);
  assert.equal(accepted.downpaymentPercent, 30);
  await assert.rejects(changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent: 30 }), isError(409));
  assert.equal(await db.collection("projects").countDocuments(), 1);
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(clerk.id), title: "Downpayment invoice ready to issue" }), 1);
  assert.equal((await db.collection("notifications").findOne({ userId: new ObjectId(clerk.id) }))?.href, "/billing-clerk/progress-billings");

  // Customers do not see the clerk's unreleased invoice; the owner-only list stays private.
  const customerView = await projectDto(projectId, customer);
  assert.equal(customerView.milestones[0].invoice, null);
  assert.equal(customerView.milestones[0].status, "Upcoming");
  assert.deepEqual(await listProjects(db, other), []);
});

test("a larger downpayment scales the remaining milestones; less than 30% is rejected", async () => {
  const estimate = await sentEstimate();
  for (const downpaymentPercent of [29.99, 0, -5, 100.01]) {
    await assert.rejects(changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent }), (error) => error instanceof BillingError || error instanceof ZodError);
  }
  await assert.rejects(changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent: 30.123 }), ZodError);
  await assert.rejects(changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent: "40" }), ZodError);
  await assert.rejects(changeEstimate(db, other, estimate.id, { action: "accept", downpaymentPercent: 40 }), isError(404));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "accept", downpaymentPercent: 40 }), isError(403));
  assert.equal((await getEstimate(db, customer, estimate.id)).status, "Sent");
  assert.equal(await db.collection("projects").countDocuments(), 0);

  const { projectId } = await changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent: 40 });
  const project = await projectDto(projectId!);
  assert.deepEqual(project.milestones.map((milestone) => milestone.amount), [2_400_000, 1_542_857.14, 1_542_857.14, 514_285.72]);
  assert.deepEqual(project.milestones.map((milestone) => milestone.percentage), [40, 25.71, 25.71, 8.57]);
  assert.equal(project.milestones.reduce((sum, milestone) => sum + Math.round(milestone.amount * 100), 0) / 100, 6_000_000);
  assert.equal(project.milestones[0].invoice?.amount, 2_400_000);
});

test("an awaiting-downpayment project only bills the downpayment, for exactly its amount", async () => {
  const { projectId } = await acceptedProject(30);
  const project = await projectDto(projectId);
  const [downpayment, structural] = project.milestones;
  const bill = (milestone: typeof downpayment, extra = {}) => ({
    projectId, milestoneId: milestone.id, label: milestone.label, basis: "Signed estimate and schedule", progressPercentage: 0,
    amount: milestone.amount, dueDate: "2099-12-31", ...extra,
  });
  await assert.rejects(createInvoice(db, clerk, bill(structural)), isError(409));
  await assert.rejects(createInvoice(db, clerk, bill(downpayment)), isError(409)); // already drafted
  await assert.rejects(createInvoice(db, clerk, bill(downpayment, { milestoneId: undefined })), (error) => error instanceof BillingError);
  await assert.rejects(createInvoice(db, clerk, bill(downpayment, { milestoneId: randomUUID() })), (error) => error instanceof BillingError);

  // Edits keep the milestone and the exact amount.
  const invoiceId = downpayment.invoice!.id;
  await assert.rejects(changeInvoice(db, clerk, invoiceId, { action: "edit", invoice: bill(downpayment, { amount: 2_000_000 }) }), isError(400));
  await assert.rejects(changeInvoice(db, clerk, invoiceId, { action: "edit", invoice: bill(structural, { label: downpayment.label }) }), isError(400));
  await changeInvoice(db, clerk, invoiceId, { action: "edit", invoice: bill(downpayment, { basis: "Signed estimate, schedule and site plan" }) });

  // Voiding frees the milestone: the DTO shows no invoice again and a replacement can be drafted.
  await changeInvoice(db, clerk, invoiceId, { action: "void", reason: "Wrong due date" });
  const afterVoid = (await projectDto(projectId)).milestones[0];
  assert.equal(afterVoid.invoice, null);
  assert.equal(afterVoid.status, "Upcoming");
  await assert.rejects(createInvoice(db, clerk, bill(downpayment, { amount: 1 })), isError(400));
  await assert.rejects(createInvoice(db, clerk, bill(structural)), isError(409));
  const replacement = await createInvoice(db, clerk, bill(downpayment));
  assert.equal((await projectDto(projectId)).milestones[0].invoice?.id, replacement);
  assert.equal((await getBillingData(db, clerk)).invoices.find((invoice) => invoice.id === replacement)?.milestoneId, downpayment.id);
  assert.equal((await getBillingData(db, clerk)).projects.find((item) => item.id === projectId)?.milestones.length, 4);
});

test("verifying the downpayment schedules the project; reversing it returns to awaiting downpayment", async () => {
  const { projectId } = await acceptedProject(30);
  const before = await projectDto(projectId);
  const invoiceId = await billMilestone(before, 0);
  assert.equal((await projectDto(projectId)).status, "Awaiting downpayment");
  const customerInvoice = (await projectDto(projectId, customer)).milestones[0];
  assert.equal(customerInvoice.invoice?.status, "Sent");
  assert.equal(customerInvoice.status, "Invoiced");

  // A partial downpayment does not start the project.
  const partial = await submitPayment(db, customer, payInput(invoiceId, 1_000_000));
  await reviewPayment(db, clerk, partial, { action: "verify" });
  let project = await projectDto(projectId);
  assert.equal(project.status, "Awaiting downpayment");
  assert.equal(project.milestones[0].status, "Partially paid");
  assert.equal(project.milestones[0].invoice?.balance, 800_000);

  const rest = await submitPayment(db, customer, payInput(invoiceId, 800_000));
  await reviewPayment(db, clerk, rest, { action: "verify" });
  project = await projectDto(projectId);
  assert.equal(project.status, "Scheduled");
  assert.equal(project.milestones[0].status, "Paid");
  assert.equal(project.paid, 1_800_000);
  assert.equal(project.balance, 4_200_000);
  assert.equal(project.nextMilestone?.id, project.milestones[1].id);
  const dueEvent = await db.collection("schedules").findOne({ projectId: new ObjectId(projectId), milestoneId: project.milestones[0].id });
  assert.equal(dueEvent?.paymentStatus, "Paid");
  const notice = await db.collection("notifications").findOne({ userId: new ObjectId(customer.id), title: "Downpayment verified — your project is scheduled" });
  assert.equal(notice?.href, "/customer/dream-house");
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(admin.id), title: "Downpayment verified" }), 1);

  await reviewPayment(db, clerk, rest, { action: "reverse", reason: "Deposit slip was not honored" });
  project = await projectDto(projectId);
  assert.equal(project.status, "Awaiting downpayment");
  assert.equal(project.milestones[0].status, "Partially paid");
  assert.equal((await db.collection("schedules").findOne({ projectId: new ObjectId(projectId), milestoneId: project.milestones[0].id }))?.paymentStatus, "Expected");

  // Paying again restores the schedule, and a project whose start date arrived becomes Active instead.
  const again = await submitPayment(db, customer, payInput(invoiceId, 800_000));
  await reviewPayment(db, clerk, again, { action: "verify" });
  assert.equal((await projectDto(projectId)).status, "Scheduled");
  await db.collection<ProjectDocument>("projects").updateOne({ _id: new ObjectId(projectId) }, { $set: { startDate: new Date(`${manilaDate()}T00:00:00.000Z`) } });
  assert.equal((await projectDto(projectId)).status, "Active");
});

test("a project whose start date has arrived becomes active as soon as the downpayment is verified", async () => {
  const { projectId } = await acceptedProject(30);
  await db.collection<ProjectDocument>("projects").updateOne({ _id: new ObjectId(projectId) }, { $set: { startDate: new Date(`${manilaDate()}T00:00:00.000Z`) } });
  await payInFull(await projectDto(projectId), 0);
  assert.equal((await projectDto(projectId)).status, "Active");
  assert.equal(await db.collection("notifications").countDocuments({ title: "Downpayment verified — your project is active" }), 1);
});

test("an admin controls project status, and completion waits until every milestone is paid", async () => {
  const { projectId } = await acceptedProject(30);
  for (const status of ["Active", "On hold", "Completed"] as const) {
    await assert.rejects(changeProjectStatus(db, admin, projectId, { action: "status", status }), isError(409));
  }
  await assert.rejects(changeProjectStatus(db, customer, projectId, { action: "status", status: "Active" }), isError(403));
  await assert.rejects(changeProjectStatus(db, clerk, projectId, { action: "status", status: "Active" }), isError(403));
  await assert.rejects(changeProjectStatus(db, admin, projectId, { action: "status", status: "Done" }), ZodError);

  await payInFull(await projectDto(projectId), 0);
  assert.equal((await projectDto(projectId)).status, "Scheduled");
  assert.equal((await changeProjectStatus(db, admin, projectId, { action: "status", status: "On hold" })).project.status, "On hold");
  assert.equal((await changeProjectStatus(db, admin, projectId, { action: "status", status: "Active" })).project.status, "Active");
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(customer.id), kind: "construction-project", title: "Project is active" }), 1);
  await assert.rejects(changeProjectStatus(db, admin, projectId, { action: "status", status: "Active" }), isError(409));

  // The stage invoices can be drafted now that the project is moving.
  for (const index of [1, 2]) await payInFull(await projectDto(projectId), index);
  await assert.rejects(changeProjectStatus(db, admin, projectId, { action: "status", status: "Completed" }), isError(409));
  const last = await projectDto(projectId);
  await billMilestone(last, 3);
  await assert.rejects(changeProjectStatus(db, admin, projectId, { action: "status", status: "Completed" }), isError(409));
  const invoiceId = (await projectDto(projectId)).milestones[3].invoice!.id;
  const partial = await submitPayment(db, customer, payInput(invoiceId, 100_000));
  await reviewPayment(db, clerk, partial, { action: "verify" });
  await assert.rejects(changeProjectStatus(db, admin, projectId, { action: "status", status: "Completed" }), isError(409));
  const remaining = await submitPayment(db, customer, payInput(invoiceId, 500_000));
  await reviewPayment(db, clerk, remaining, { action: "verify" });

  const completed = (await changeProjectStatus(db, admin, projectId, { action: "status", status: "Completed" })).project;
  assert.equal(completed.status, "Completed");
  assert.equal(completed.paid, 6_000_000);
  assert.equal(completed.balance, 0);
  assert.equal(completed.nextMilestone, null);
  assert.ok(completed.milestones.every((milestone) => milestone.status === "Paid"));
  assert.equal(await db.collection("schedules").countDocuments({ projectId: new ObjectId(projectId), paymentStatus: "Paid" }), 4);

  // The completed project is saved as a draft house design with its design images and accepted estimate.
  const designs = await db.collection<HouseDesignDocument>("house_designs").find({ "sourceProject.projectId": new ObjectId(projectId) }).toArray();
  assert.equal(designs.length, 1);
  const [design] = designs;
  assert.equal(design.status, "Draft");
  assert.equal(design.area, 120);
  assert.equal(design.rooms, "3 bedrooms, 2 bathrooms");
  assert.deepEqual(design.images, ["data:image/png;base64,AAAA"]);
  assert.ok(design.name.endsWith(completed.reference));
  assert.equal(design.sourceProject!.contractPrice, 6_000_000);
  assert.ok(design.sourceProject!.lineItems.length > 0);
  // Running the sync again (as the House Design page does) does not duplicate it.
  assert.deepEqual(await syncCompletedProjectDesigns(db, admin), []);
  assert.equal(await db.collection("house_designs").countDocuments({ "sourceProject.projectId": new ObjectId(projectId) }), 1);
});

test("legacy projects without a payment schedule keep their existing billing rules", async () => {
  const now = new Date();
  const legacyId = new ObjectId();
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: legacyId, reference: "PRJ-001", name: "Legacy residence", customerId: new ObjectId(customer.id), status: "Active", contractPrice: 200000, createdAt: now, updatedAt: now,
  });
  const legacy = { projectId: legacyId.toHexString(), label: "Foundation work", basis: "Signed milestone 1 and approved site report", progressPercentage: 25, amount: 100000, dueDate: "2099-12-31" };
  await assert.rejects(createInvoice(db, clerk, { ...legacy, milestoneId: randomUUID() }), isError(400));
  const invoiceId = await createInvoice(db, clerk, legacy);
  await changeInvoice(db, clerk, invoiceId, { action: "issue" });
  const dto = await projectDto(legacyId.toHexString());
  assert.deepEqual(dto.milestones, []);
  assert.equal(dto.nextMilestone, null);
  assert.equal(dto.downpaymentPercent, null);
  assert.deepEqual((await getBillingData(db, clerk)).projects[0].milestones, []);
  await db.collection("projects").updateOne({ _id: legacyId }, { $set: { status: "Awaiting downpayment" } });
  await assert.rejects(createInvoice(db, clerk, { ...legacy, label: "Second stage" }), isError(400));
});
