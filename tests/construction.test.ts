import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { ZodError } from "zod";
import { getDatabase } from "@/lib/database/mongodb";
import type { DesignRequestDocument, InvoiceDocument, PaymentDocument, ProjectDocument, UserDocument } from "@/lib/database/collections";
import { BillingError, changeInvoice, createInvoice, getBillingData, reviewPayment, submitPayment } from "@/lib/server/billing";
import { changeEstimate, changeProjectStatus, createConstructionRequest, getEstimate, listEstimates, listProjects, prefillEstimate } from "@/lib/server/construction";
import { defaultScheduleTemplate } from "@/lib/construction";
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
    _id: id, customerId: new ObjectId(owner.id), floorArea: 120, rooms: "3 bedrooms, 2 bathrooms", finish: "Standard",
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
  assert.equal(estimate.designLabel, "120 sqm · Standard");
  assert.ok(estimate.siteAddress.includes("Balayan"));
  const duplicates = await Promise.allSettled([createConstructionRequest(db, customer, requestInput(unlocked)), createConstructionRequest(db, customer, requestInput(unlocked))]);
  assert.ok(duplicates.every((result) => result.status === "rejected" && isError(409)(result.reason)));
  assert.equal(await db.collection("cost_estimates").countDocuments(), 1);
  const notice = await db.collection("notifications").findOne({ kind: "construction-request" });
  assert.equal(notice?.userId.toHexString(), admin.id);
  assert.equal(notice?.href, `/admin/cost-estimates?estimate=${estimate.id}`);
});

test("admin prefills a base line, then saves and sends a validated estimate", async () => {
  const estimate = await requestedEstimate();
  const prefill = await prefillEstimate(db, admin, estimate.id);
  assert.equal(prefill.lineItems.length, 1);
  assert.equal(prefill.lineItems[0].quantity, 120);
  assert.equal(prefill.lineItems[0].unitPrice, 0);
  assert.deepEqual(prefill.scheduleTemplate.map((row) => row.percentage), [30, 30, 30, 10]);
  assert.equal(prefill.scheduleTemplate[0].targetDate, startDate());
  assert.equal(prefill.scheduleTemplate[3].targetDate, neededBy());
  await assert.rejects(prefillEstimate(db, customer, estimate.id), isError(403));

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
  assert.equal(saved.vat, 720_000);
  assert.equal(saved.total, 6_720_000);
  const sent = (await changeEstimate(db, admin, estimate.id, { action: "send" })).estimate;
  assert.equal(sent.status, "Sent");
  assert.ok(sent.sentAt);
  await assert.rejects(changeEstimate(db, admin, estimate.id, savePayload()), isError(409));
  await assert.rejects(changeEstimate(db, admin, estimate.id, { action: "send" }), isError(409));
  assert.equal((await db.collection("notifications").findOne({ userId: new ObjectId(customer.id), kind: "construction-estimate" }))?.href, `/customer/project?estimate=${estimate.id}`);
});

test("customers never see line items before the estimate is sent, and only their own estimates", async () => {
  const estimate = await requestedEstimate();
  const hiddenView = (dto: CostEstimateDto) => {
    assert.deepEqual(dto.lineItems, []);
    assert.deepEqual(dto.scheduleTemplate, []);
    assert.equal(dto.total, 0);
    assert.equal(dto.subtotal, 0);
    assert.equal(dto.vat, 0);
  };
  hiddenView(await getEstimate(db, customer, estimate.id));
  await changeEstimate(db, admin, estimate.id, savePayload());
  hiddenView(await getEstimate(db, customer, estimate.id));
  hiddenView((await listEstimates(db, customer))[0]);
  assert.equal((await getEstimate(db, admin, estimate.id)).total, 6_720_000);
  await assert.rejects(getEstimate(db, other, estimate.id), isError(404));
  assert.deepEqual(await listEstimates(db, other), []);
  await assert.rejects(listEstimates(db, clerk), isError(403));

  await changeEstimate(db, admin, estimate.id, { action: "send" });
  const visible = await getEstimate(db, customer, estimate.id);
  assert.equal(visible.total, 6_720_000);
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
  assert.equal(resent.total, 5_600_000);
});

test("accepting at 30% creates the project, a Draft downpayment invoice, and payment-due events", async () => {
  const { estimate, projectId } = await acceptedProject(30);
  const project = await projectDto(projectId);
  assert.equal(project.status, "Awaiting downpayment");
  assert.equal(project.name, "120 sqm · Standard – Construction");
  assert.match(project.reference, /^PRJ-\d{4}-\d{6}$/);
  assert.equal(project.contractPrice, 6_720_000);
  assert.equal(project.subtotal, 6_000_000);
  assert.equal(project.vat, 720_000);
  assert.equal(project.estimateId, estimate.id);
  assert.equal(project.downpaymentPercent, 30);
  assert.equal(project.startDate, startDate());
  assert.equal(project.neededBy, neededBy());
  assert.deepEqual(project.milestones.map((milestone) => milestone.amount), [2_016_000, 2_016_000, 2_016_000, 672_000]);
  assert.deepEqual(project.milestones.map((milestone) => milestone.isDownpayment), [true, false, false, false]);
  assert.equal(project.milestones[0].invoice?.status, "Draft");
  assert.equal(project.milestones[0].invoice?.amount, 2_016_000);
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
  assert.equal(events[0].expectedAmount, 2_016_000);

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
  assert.deepEqual(project.milestones.map((milestone) => milestone.amount), [2_688_000, 1_728_000, 1_728_000, 576_000]);
  assert.deepEqual(project.milestones.map((milestone) => milestone.percentage), [40, 25.71, 25.71, 8.57]);
  assert.equal(project.milestones.reduce((sum, milestone) => sum + milestone.amount, 0), 6_720_000);
  assert.equal(project.milestones[0].invoice?.amount, 2_688_000);
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
  assert.equal(project.milestones[0].invoice?.balance, 1_016_000);

  const rest = await submitPayment(db, customer, payInput(invoiceId, 1_016_000));
  await reviewPayment(db, clerk, rest, { action: "verify" });
  project = await projectDto(projectId);
  assert.equal(project.status, "Scheduled");
  assert.equal(project.milestones[0].status, "Paid");
  assert.equal(project.paid, 2_016_000);
  assert.equal(project.balance, 4_704_000);
  assert.equal(project.nextMilestone?.id, project.milestones[1].id);
  const dueEvent = await db.collection("schedules").findOne({ projectId: new ObjectId(projectId), milestoneId: project.milestones[0].id });
  assert.equal(dueEvent?.paymentStatus, "Paid");
  const notice = await db.collection("notifications").findOne({ userId: new ObjectId(customer.id), title: "Downpayment verified — your project is scheduled" });
  assert.equal(notice?.href, "/customer/project");
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(admin.id), title: "Downpayment verified" }), 1);

  await reviewPayment(db, clerk, rest, { action: "reverse", reason: "Deposit slip was not honored" });
  project = await projectDto(projectId);
  assert.equal(project.status, "Awaiting downpayment");
  assert.equal(project.milestones[0].status, "Partially paid");
  assert.equal((await db.collection("schedules").findOne({ projectId: new ObjectId(projectId), milestoneId: project.milestones[0].id }))?.paymentStatus, "Expected");

  // Paying again restores the schedule, and a project whose start date arrived becomes Active instead.
  const again = await submitPayment(db, customer, payInput(invoiceId, 1_016_000));
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
  const remaining = await submitPayment(db, customer, payInput(invoiceId, 572_000));
  await reviewPayment(db, clerk, remaining, { action: "verify" });

  const completed = (await changeProjectStatus(db, admin, projectId, { action: "status", status: "Completed" })).project;
  assert.equal(completed.status, "Completed");
  assert.equal(completed.paid, 6_720_000);
  assert.equal(completed.balance, 0);
  assert.equal(completed.nextMilestone, null);
  assert.ok(completed.milestones.every((milestone) => milestone.status === "Paid"));
  assert.equal(await db.collection("schedules").countDocuments({ projectId: new ObjectId(projectId), paymentStatus: "Paid" }), 4);
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
