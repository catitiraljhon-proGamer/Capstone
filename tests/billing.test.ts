import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";
import { type DesignRequestDocument, type ApprovalDocument, type HouseDesignDocument, type InvoiceDocument, type PaymentDocument, type ProjectDocument, type UserDocument } from "@/lib/database/collections";
import { BillingError, assertBillingRole, changeInvoice, createInvoice, getBillingData, getOwnedPayment, getReceipt, invoiceInputSchema, paymentInputSchema, reviewPayment, submitPayment } from "@/lib/server/billing";
import { invoiceState, manilaDate } from "@/lib/billing";
import { receiptHtml } from "@/lib/server/billing-receipt";
import { getClerkCashSummary, listCashReports, submitCashReport, verifyCashReport } from "@/lib/server/cash-reports";
import { sendDuePaymentReminders } from "@/lib/server/payment-reminders";
import { deleteBlueprintFile, getBlueprintFile, getCustomerDesignImage, getDesignVersionImage, getDesignWorkflow, listCustomerDesigns, reopenBlueprint, respondToDesign, submitBlueprint, uploadBlueprintFile, uploadDesignVersion } from "@/lib/server/design-requests";
import { createDesignRequest } from "@/lib/server/create-design-request";
import { requestBlueprintPickup, reviewMeetingRequest } from "@/lib/server/schedules";
import { acceptAccountTerms, requireAccountTerms } from "@/lib/server/account-terms";
import { accountTerms, accountTermsText } from "@/lib/account-terms";
import { designRequestTerms } from "@/lib/design-request-terms";
import { ZodError } from "zod";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryReplSet;
let db: Db;
const clerk: SessionUser = { id: new ObjectId().toHexString(), name: "Billing Clerk", email: "clerk@example.test", role: "billing-clerk" };
const customer: SessionUser = { id: new ObjectId().toHexString(), name: "Test Customer", email: "customer@example.test", role: "customer" };
const other: SessionUser = { id: new ObjectId().toHexString(), name: "Other Customer", email: "other@example.test", role: "customer" };
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const projectId = new ObjectId();
const draft = { projectId: projectId.toHexString(), label: "Foundation work", basis: "Signed milestone 1 and approved site report A01", progressPercentage: 25, amount: 100000, dueDate: "2099-12-31" };
const isError = (status: number) => (error: unknown) => error instanceof BillingError && error.status === status;

const dates = { preferredDate: "2099-01-10", neededBy: "2099-02-10" };
const privateImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1cAAAAASUVORK5CYII=";

/** Records the customer's one-time Terms and Conditions agreement and returns its audit record id. */
async function agree(actor: SessionUser = customer) {
  const result = await acceptAccountTerms(db, actor, { accepted: true, version: accountTerms.version });
  const saved = await requireAccountTerms(db, actor);
  return { id: saved.auditLogId.toHexString(), acceptedAt: result.acceptedAt };
}

async function publishedHouseDesign() {
  const now = new Date();
  const design: HouseDesignDocument = {
    _id: new ObjectId(), name: "Selected courtyard house",
    area: 95, rooms: "2 bedrooms, 1 bathroom", rate: 25000,
    images: [privateImage], notes: "Published design", status: "Published",
    customItems: [], createdAt: now, updatedAt: now,
    createdBy: new ObjectId(admin.id), createdByName: admin.name,
  };
  await db.collection<HouseDesignDocument>("house_designs").insertOne(design);
  return design;
}

test("requesting a published design keeps its identity and specifications without duplicate uploads", async () => {
  const design = await publishedHouseDesign();
  const acceptance = await agree();
  const result = await createDesignRequest(db, customer, { houseDesignId: design._id.toHexString(), ...dates });
  assert.equal(result.selectedDesign?.id, design._id.toHexString());
  assert.equal(result.selectedDesign.name, design.name);
  assert.equal(result.floorArea, design.area);
  assert.equal(result.rooms, design.rooms);
  assert.equal(result.notes, "I would like to request this design as shown.");
  assert.deepEqual(result.inspirationImages, []);
  assert.equal(result.status, "Pending");
  assert.equal(result.access, "in-progress");
  const saved = await db.collection<DesignRequestDocument>("design_requests").findOne({ _id: new ObjectId(result.id) });
  assert.equal(saved?.houseDesignId?.toHexString(), design._id.toHexString());
  assert.equal(saved?.projectId, undefined);
  assert.equal(saved?.termsAcceptance?.auditLogId.toHexString(), acceptance.id);
  assert.equal(await db.collection("approvals").countDocuments({ recordId: new ObjectId(result.id), status: "Pending" }), 1);
  const notification = await db.collection("notifications").findOne({ kind: "design-request" });
  assert.ok(notification?.body.includes(design.name));
  await db.collection("house_designs").updateOne({ _id: design._id }, { $set: { name: "Renamed design", area: 150, status: "Archived" } });
  const history = await listCustomerDesigns(db, customer);
  assert.equal(history[0].selectedDesign?.name, design.name);
  assert.equal(history[0].floorArea, design.area);
});

test("selected designs reject unavailable records, forged specifications, unauthorized roles, and missing terms", async () => {
  const design = await publishedHouseDesign();
  await agree();
  const input = { houseDesignId: design._id.toHexString(), ...dates };
  for (const actor of [admin, clerk]) await assert.rejects(createDesignRequest(db, actor, input), isError(403));
  await assert.rejects(createDesignRequest(db, other, input), isError(409));
  await assert.rejects(createDesignRequest(db, customer, { houseDesignId: input.houseDesignId }), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, houseDesignId: "invalid" }), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, floorArea: 1 }), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, selectedDesign: { name: "Forged design" } }), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, houseDesignId: new ObjectId().toHexString() }), isError(404));
  for (const status of ["Draft", "Archived"]) {
    await db.collection("house_designs").updateOne({ _id: design._id }, { $set: { status } });
    await assert.rejects(createDesignRequest(db, customer, input), isError(404));
  }
  assert.equal(await db.collection("design_requests").countDocuments(), 0);
  assert.equal(await db.collection("approvals").countDocuments(), 0);
  assert.equal(await db.collection("notifications").countDocuments(), 0);
});

test("customers can have at most three design requests waiting for review", async () => {
  const design = await publishedHouseDesign();
  await agree();
  const input = { houseDesignId: design._id.toHexString(), ...dates };
  const customerId = new ObjectId(customer.id);
  const now = new Date();
  const existing = (status: DesignRequestDocument["status"]): DesignRequestDocument => ({
    _id: new ObjectId(), customerId, floorArea: 80, rooms: "2 bedrooms", notes: "Earlier request",
    inspirationImages: [], status, createdAt: now, updatedAt: now,
  });
  // Decided requests do not count toward the limit.
  await db.collection<DesignRequestDocument>("design_requests").insertMany([
    existing("Pending"), existing("In review"), existing("Approved"), existing("Rejected"), existing("Completed"),
  ]);
  const third = await createDesignRequest(db, customer, input);
  assert.equal(third.status, "Pending");

  await assert.rejects(createDesignRequest(db, customer, input), (error: unknown) =>
    isError(409)(error) && /3 design requests waiting for review/.test((error as Error).message));
  assert.equal(await db.collection("design_requests").countDocuments({ customerId }), 6);

  // Once the admin decides on one, the customer can request again.
  await db.collection("design_requests").updateOne({ _id: new ObjectId(third.id) }, { $set: { status: "Rejected" } });
  assert.equal((await createDesignRequest(db, customer, input)).status, "Pending");

  await agree(other);
  assert.equal((await createDesignRequest(db, other, input)).status, "Pending");
});

test("custom design requests still require requirements and inspiration images", async () => {
  await agree();
  const input = { houseType: "Modern", finish: "Semi-luxury", floorArea: 80, bedrooms: 2, bathrooms: 1, notes: "Custom courtyard layout", inspirationImages: [privateImage], ...dates };
  // Custom requests choose one of the three finish levels.
  await assert.rejects(createDesignRequest(db, customer, { ...input, finish: undefined }), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, finish: "Ultra" }), ZodError);
  // Custom requests choose one of the offered house types.
  await assert.rejects(createDesignRequest(db, customer, { ...input, houseType: undefined }), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, houseType: "Castle" }), isError(400));
  await assert.rejects(createDesignRequest(db, customer, { ...input, inspirationImages: [] }), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, notes: "" }), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, bedrooms: 101 }), /Bedrooms cannot be more than 100/);
  await assert.rejects(createDesignRequest(db, customer, { ...input, bathrooms: 101 }), /Bathrooms cannot be more than 100/);
  assert.equal((await createDesignRequest(db, customer, { ...input, bedrooms: 100, bathrooms: 100 })).rooms, "100 bedrooms, 100 bathrooms");
  const request = await createDesignRequest(db, customer, input);
  assert.equal(request.selectedDesign, undefined);
  assert.equal(request.rooms, "2 bedrooms, 1 bathroom");
  assert.equal(request.houseType, "Modern");
  assert.equal(request.finish, "Semi-luxury");
  assert.deepEqual(request.inspirationImages, [privateImage]);
});

test("design requests require a Preferred Date and Needed By in the future, in order, and return them", async () => {
  const design = await publishedHouseDesign();
  await agree();
  const input = { houseDesignId: design._id.toHexString(), ...dates };
  const custom = { houseType: "Modern", finish: "Standard", floorArea: 80, bedrooms: 2, bathrooms: 1, notes: "Custom layout", inspirationImages: [privateImage], ...dates };
  const withoutPreferred = { ...input, preferredDate: undefined };
  const withoutNeeded = { ...custom, neededBy: undefined };
  await assert.rejects(createDesignRequest(db, customer, withoutPreferred), ZodError);
  await assert.rejects(createDesignRequest(db, customer, withoutNeeded), ZodError);
  await assert.rejects(createDesignRequest(db, customer, { ...input, preferredDate: "not-a-date" }), ZodError);
  const today = manilaDate();
  await assert.rejects(createDesignRequest(db, customer, { ...input, preferredDate: "2020-01-01" }), isError(400));
  await assert.rejects(createDesignRequest(db, customer, { ...input, preferredDate: today }), isError(400));
  await assert.rejects(createDesignRequest(db, customer, { ...custom, neededBy: today }), isError(400));
  await assert.rejects(createDesignRequest(db, customer, { ...input, preferredDate: "2099-03-01", neededBy: "2099-02-01" }), isError(400));
  await assert.rejects(createDesignRequest(db, customer, { ...custom, preferredDate: "2099-03-01", neededBy: "2099-02-01" }), isError(400));
  assert.equal(await db.collection("design_requests").countDocuments(), 0);
  const result = await createDesignRequest(db, customer, { ...input, neededBy: dates.preferredDate });
  assert.equal(result.preferredDate, "2099-01-10");
  assert.equal(result.neededBy, "2099-01-10");
  const saved = await db.collection<DesignRequestDocument>("design_requests").findOne({ _id: new ObjectId(result.id) });
  assert.equal(saved?.preferredDate?.toISOString(), "2099-01-10T00:00:00.000Z");
  assert.equal(saved?.neededBy?.toISOString(), "2099-01-10T00:00:00.000Z");
  const listed = (await listCustomerDesigns(db, customer))[0];
  assert.equal(listed.preferredDate, "2099-01-10");
  assert.equal(listed.neededBy, "2099-01-10");
});

test("a selected design is reviewed for free, and only the blueprint is paid before construction billing", async () => {
  const design = await publishedHouseDesign();
  await agree();
  const request = await createDesignRequest(db, customer, {
    houseDesignId: design._id.toHexString(), ...dates,
    notes: "Please review a different gate finish.", inspirationImages: [privateImage],
  });
  assert.equal(request.notes, "Please review a different gate finish.");
  assert.deepEqual(request.inspirationImages, [privateImage]);
  await db.collection("design_requests").updateOne({ _id: new ObjectId(request.id) }, { $set: { status: "Approved" } });
  await db.collection("approvals").updateOne({ recordId: new ObjectId(request.id) }, { $set: { status: "Approved" } });

  // Free review loop: the customer sees each version before paying anything.
  await uploadDesignVersion(db, admin, request.id, { images: [privateImage], note: "First layout" });
  let listed = (await listCustomerDesigns(db, customer))[0];
  assert.equal(listed.workflow, "blueprint");
  assert.equal(listed.status, "In customer review");
  assert.equal(listed.access, "in-progress");
  assert.ok(!JSON.stringify(listed.versions).includes("base64"));
  assert.deepEqual((await getDesignVersionImage(db, customer, request.id, 1, 0)).bytes, Buffer.from(privateImage.split(",")[1], "base64"));
  await respondToDesign(db, customer, request.id, { decision: "changes", note: "Move the kitchen to the back." });
  await uploadDesignVersion(db, admin, request.id, { images: [privateImage, privateImage], note: "Kitchen moved" });
  await respondToDesign(db, customer, request.id, { decision: "approved" });
  listed = (await listCustomerDesigns(db, customer))[0];
  assert.equal(listed.status, "Design approved");
  assert.deepEqual(listed.versions.map((version) => [version.version, version.imageCount, version.response?.decision]), [[1, 1, "changes"], [2, 2, "approved"]]);
  assert.equal(listed.access, "awaiting-invoice");
  assert.equal(await db.collection("payments").countDocuments(), 0);

  // The blueprint fee needs submitted blueprint files; no construction estimate is needed.
  await assert.rejects(createInvoice(db, clerk, feeInput(request.id)), isError(409));
  const file = await uploadBlueprintFile(db, admin, request.id, { name: "A-101 floor plan.pdf", dataUrl: blueprintPdf });
  // The Billing Clerk is asked to bill only after the admin submits the finished blueprint.
  assert.equal(await db.collection("notifications").countDocuments({ kind: "blueprint-fee" }), 0);
  await assert.rejects(createInvoice(db, clerk, feeInput(request.id)), isError(409));
  assert.equal((await getBillingData(db, clerk)).designRequests.length, 0);
  await assert.rejects(submitBlueprint(db, customer, request.id), isError(403));
  await submitBlueprint(db, admin, request.id);
  assert.equal(await db.collection("notifications").countDocuments({ kind: "blueprint-fee" }), 1);
  await assert.rejects(submitBlueprint(db, admin, request.id), isError(409));
  await assert.rejects(uploadBlueprintFile(db, admin, request.id, { name: "late.pdf", dataUrl: blueprintPdf }), isError(409));
  // Before anything is billed, the admin can reopen the blueprint to fix files, then submit again.
  assert.equal((await getDesignWorkflow(db, admin, request.id)).blueprintCanReopen, true);
  await assert.rejects(reopenBlueprint(db, customer, request.id), isError(403));
  await reopenBlueprint(db, admin, request.id);
  const extra = await uploadBlueprintFile(db, admin, request.id, { name: "A-102 elevations.pdf", dataUrl: blueprintPdf });
  await deleteBlueprintFile(db, admin, request.id, extra.id);
  await submitBlueprint(db, admin, request.id);
  await assert.rejects(getBlueprintFile(db, customer, request.id, file.id), isError(403));
  assert.equal((await getBillingData(db, clerk)).designRequests[0].feeType, "blueprint");
  const invoiceId = await createInvoice(db, clerk, feeInput(request.id));
  assert.equal((await db.collection<InvoiceDocument>("invoices").findOne({ _id: new ObjectId(invoiceId) }))?.feeType, "blueprint");
  // Once the clerk prepares the fee invoice, the files stay locked until that invoice is voided.
  assert.equal((await getDesignWorkflow(db, admin, request.id)).blueprintCanReopen, false);
  await assert.rejects(reopenBlueprint(db, admin, request.id), isError(409));
  await changeInvoice(db, clerk, invoiceId, { action: "issue" });

  // Construction billing waits for the blueprint.
  const project = await linkedProject(request.id);
  await assert.rejects(createInvoice(db, clerk, { ...draft, projectId: project }), isError(409));
  const paymentId = await submitPayment(db, customer, payment(invoiceId, 5000));
  assert.equal((await listCustomerDesigns(db, customer))[0].access, "payment-required");
  // A pickup of the printed blueprint waits for full payment.
  await assert.rejects(requestBlueprintPickup(db, customer, request.id, pickup, scheduleNow), isError(409));
  await reviewPayment(db, clerk, paymentId, { action: "verify" });
  listed = (await listCustomerDesigns(db, customer))[0];
  assert.equal(listed.selectedDesign?.id, design._id.toHexString());
  assert.equal(listed.access, "unlocked");
  const downloaded = await getBlueprintFile(db, customer, request.id, file.id);
  assert.equal(downloaded.name, "A-101 floor plan.pdf");
  assert.equal(downloaded.bytes.toString("ascii", 0, 5), "%PDF-");
  await assert.rejects(getBlueprintFile(db, other, request.id, file.id), isError(404));
  await assert.rejects(deleteBlueprintFile(db, admin, request.id, file.id), isError(409));
  assert.equal(await db.collection("notifications").countDocuments({ title: "Your blueprint is unlocked" }), 1);
  // No project is waiting for a downpayment, so no downpayment invoice is issued.
  assert.equal(await db.collection("notifications").countDocuments({ title: "Downpayment invoice issued" }), 0);
  await createInvoice(db, clerk, { ...draft, projectId: project });

  // Once paid, the customer can also ask to pick up the printed blueprint; the admin confirms it.
  await assert.rejects(requestBlueprintPickup(db, other, request.id, pickup, scheduleNow), isError(404));
  await assert.rejects(requestBlueprintPickup(db, customer, request.id, { preferredTimes: ["2026-10-19T04:30:00.000Z"] }, scheduleNow), isError(400)); // 12:30 PM lunch
  await assert.rejects(requestBlueprintPickup(db, customer, request.id, { preferredTimes: ["2026-10-24T05:00:00.000Z"] }, scheduleNow), isError(400)); // Saturday 1:00 PM
  const sent = await requestBlueprintPickup(db, customer, request.id, pickup, scheduleNow);
  assert.equal(sent.purpose, "blueprint-pickup");
  assert.equal(sent.mode, "In person");
  assert.equal(await db.collection("notifications").countDocuments({ title: "Blueprint pickup request" }), 1);
  assert.equal((await listCustomerDesigns(db, customer))[0].pickup?.status, "Pending");
  await assert.rejects(requestBlueprintPickup(db, customer, request.id, pickup, scheduleNow), isError(409));
  await reviewMeetingRequest(db, admin, sent.id, { action: "approve", scheduledFor: pickup.preferredTimes[0], durationMinutes: 30 }, scheduleNow);
  const scheduled = (await listCustomerDesigns(db, customer))[0].pickup;
  assert.equal(scheduled?.status, "Approved");
  assert.equal(scheduled?.scheduledFor, pickup.preferredTimes[0]);
  assert.equal(await db.collection("notifications").countDocuments({ title: "Blueprint pickup scheduled" }), 1);
  await assert.rejects(requestBlueprintPickup(db, customer, request.id, pickup, scheduleNow), isError(409));
});

test("a downpayment waiting on the blueprint fee is issued automatically once the fee is fully paid", async () => {
  const now = new Date();
  const designRequestId = new ObjectId(await designFixture("Design approved"));
  const feeId = new ObjectId();
  const downpaymentId = new ObjectId();
  const waitingProjectId = new ObjectId();
  const milestoneId = randomUUID();
  await db.collection<InvoiceDocument>("invoices").insertMany([
    { _id: feeId, invoiceNumber: "INV-FEE", customerId: new ObjectId(customer.id), designRequestId, feeType: "blueprint",
      label: "Blueprint fee", progressPercentage: 0, amount: 5000, dueDate: new Date("2099-12-31T00:00:00.000Z"), status: "Sent", createdAt: now, updatedAt: now },
    { _id: downpaymentId, invoiceNumber: "INV-DOWN", customerId: new ObjectId(customer.id), projectId: waitingProjectId, milestoneId,
      label: "Downpayment / Mobilization", progressPercentage: 0, amount: 60000, dueDate: new Date("2020-01-01T00:00:00.000Z"), status: "Draft", createdAt: now, updatedAt: now },
  ]);
  // Accepted before the blueprint was paid, so its downpayment invoice is still a draft.
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: waitingProjectId, reference: "PRJ-WAIT", name: "Waiting residence", customerId: new ObjectId(customer.id), designRequestId,
    status: "Awaiting downpayment", contractPrice: 200000, startDate: new Date("2099-06-01T00:00:00.000Z"),
    paymentSchedule: [{ id: milestoneId, label: "Downpayment / Mobilization", description: "", percentage: 30, amount: 60000,
      targetDate: new Date("2099-06-01T00:00:00.000Z"), isDownpayment: true, invoiceId: downpaymentId }],
    createdAt: now, updatedAt: now,
  });

  // A partial blueprint payment does not release the downpayment invoice.
  await reviewPayment(db, clerk, await submitPayment(db, customer, payment(feeId.toHexString(), 2000)), { action: "verify" });
  assert.equal((await db.collection<InvoiceDocument>("invoices").findOne({ _id: downpaymentId }))?.status, "Draft");

  await reviewPayment(db, clerk, await submitPayment(db, customer, payment(feeId.toHexString(), 3000)), { action: "verify" });
  const downpayment = await db.collection<InvoiceDocument>("invoices").findOne({ _id: downpaymentId });
  assert.equal(downpayment?.status, "Sent");
  assert.ok(downpayment?.issuedAt);
  // The old due date had passed; it counts from the day the invoice is issued.
  const week = new Date(`${manilaDate()}T00:00:00.000Z`);
  week.setUTCDate(week.getUTCDate() + 7);
  assert.equal(downpayment?.dueDate.toISOString(), week.toISOString());
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(clerk.id), title: "Downpayment invoice issued" }), 1);
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(customer.id), title: "New invoice", entityId: downpaymentId }), 1);
});

test("the Terms and Conditions need an explicit customer agreement to the current version", async () => {
  const input = { accepted: true, version: accountTerms.version };
  await assert.rejects(acceptAccountTerms(db, admin, input), isError(403));
  await assert.rejects(acceptAccountTerms(db, clerk, input), isError(403));
  for (const invalid of [{}, { ...input, accepted: false }, { ...input, accepted: "true" }, { ...input, version: "old-version" }]) {
    await assert.rejects(acceptAccountTerms(db, customer, invalid), ZodError);
  }
  assert.equal(await db.collection("audit_logs").countDocuments(), 0);
});

test("the agreement saves the customer identity, server timestamp, and exact terms, once per account", async () => {
  const beforeAcceptance = Date.now();
  const acceptance = await agree();
  const event = await db.collection("audit_logs").findOne({ _id: new ObjectId(acceptance.id) });
  assert.ok(event);
  assert.equal(event.actorId.toHexString(), customer.id);
  assert.equal(event.actorRole, "customer");
  assert.equal(event.details.accepted, true);
  assert.equal(event.details.termsSnapshot, accountTermsText);
  assert.ok(event.details.termsSnapshot.includes(designRequestTerms.paymentNotice));
  for (const section of accountTerms.sections) assert.ok(event.details.termsSnapshot.includes(section.body));
  assert.equal(event.createdAt.toISOString(), acceptance.acceptedAt);
  assert.ok(event.createdAt.getTime() >= beforeAcceptance && event.createdAt.getTime() <= Date.now());
  const saved = await requireAccountTerms(db, customer);
  assert.equal(saved.auditLogId.toHexString(), acceptance.id);
  assert.equal(saved.version, accountTerms.version);
  await agree();
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "account.terms-accepted" }), 1);
});

test("design requests need the customer's own Terms and Conditions agreement", async () => {
  const design = await publishedHouseDesign();
  const input = { houseDesignId: design._id.toHexString(), ...dates };
  await assert.rejects(createDesignRequest(db, customer, input), isError(409));
  await agree(other);
  await assert.rejects(createDesignRequest(db, customer, input), isError(409));
  await assert.rejects(createDesignRequest(db, customer, { ...input, termsAcceptanceId: new ObjectId().toHexString() }), ZodError);
  await agree();
  assert.equal((await createDesignRequest(db, customer, input)).status, "Pending");
});

test("agreeing to the terms does not unlock unpaid designs or create a payment", async () => {
  const { designId } = await deliveredFee();
  await agree();
  assert.equal((await listCustomerDesigns(db, customer))[0].access, "payment-required");
  await assert.rejects(getCustomerDesignImage(db, customer, designId, 0), isError(403));
  assert.equal(await db.collection("payments").countDocuments(), 0);
});

async function designFixture(status: DesignRequestDocument["status"] = "Approved") {
  const now = new Date();
  const id = new ObjectId();
  await db.collection<DesignRequestDocument>("design_requests").insertOne({
    _id: id, customerId: new ObjectId(customer.id), floorArea: 120, rooms: "3 bedrooms, 2 bathrooms",
    notes: "Requested courtyard home", status, createdAt: now, updatedAt: now,
  });
  await db.collection<ApprovalDocument>("approvals").insertOne({
    _id: new ObjectId(), reference: "APR-" + id, customerId: new ObjectId(customer.id), recordId: id,
    recordType: "Design request", status: "Approved", createdAt: now,
  });
  return id.toHexString();
}
const feeInput = (designRequestId: string) => ({
  designRequestId, label: "House design fee", basis: "Agreed design fee per signed quotation",
  amount: 5000, progressPercentage: 0, dueDate: "2099-12-31",
});
const blueprintPdf = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n% G4 Builders test blueprint\n").toString("base64")}`;
/** Legacy requests were delivered before the blueprint workflow; the delivery step no longer exists. */
async function deliverLegacy(id: string) {
  await db.collection<DesignRequestDocument>("design_requests").updateOne({ _id: new ObjectId(id) }, { $set: {
    status: "Completed", completedDesignImages: [privateImage], completedAt: new Date(),
  } });
}
// Saturday, October 17, 2026, 8:00 AM in Manila; the pickup is Monday at 10:00 AM.
const scheduleNow = new Date("2026-10-17T00:00:00.000Z");
const pickup = { preferredTimes: ["2026-10-19T02:00:00.000Z"] };
/** A construction project created from the request's accepted estimate. */
async function linkedProject(designRequestId: string) {
  const now = new Date();
  const id = new ObjectId();
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: id, reference: "PRJ-002", name: "Blueprint residence", customerId: new ObjectId(customer.id), designRequestId: new ObjectId(designRequestId),
    status: "Active", contractPrice: 200000, createdAt: now, updatedAt: now,
  });
  return id.toHexString();
}
async function deliveredFee() {
  const designId = await designFixture();
  await deliverLegacy(designId);
  const invoiceId = await createInvoice(db, clerk, feeInput(designId));
  await changeInvoice(db, clerk, invoiceId, { action: "issue" });
  return { designId, invoiceId };
}

test("only the admin sends design versions, one review at a time, and only the owner answers them", async () => {
  const id = await designFixture("Pending");
  await assert.rejects(uploadDesignVersion(db, customer, id, { images: [privateImage] }), isError(403));
  await assert.rejects(uploadDesignVersion(db, clerk, id, { images: [privateImage] }), isError(403));
  await assert.rejects(uploadDesignVersion(db, admin, id, { images: [privateImage] }), isError(409));
  await db.collection("design_requests").updateOne({ _id: new ObjectId(id) }, { $set: { status: "Approved" } });
  await assert.rejects(respondToDesign(db, customer, id, { decision: "approved" }), isError(409));
  await uploadDesignVersion(db, admin, id, { images: [privateImage] });
  assert.equal(await db.collection("notifications").countDocuments({ kind: "design-review" }), 1);
  await assert.rejects(uploadDesignVersion(db, admin, id, { images: [privateImage] }), isError(409));
  await assert.rejects(respondToDesign(db, other, id, { decision: "approved" }), isError(404));
  await assert.rejects(respondToDesign(db, admin, id, { decision: "approved" }), isError(403));
  await assert.rejects(respondToDesign(db, customer, id, { decision: "changes", note: "" }), ZodError);
  await assert.rejects(getDesignVersionImage(db, other, id, 1, 0), isError(404));
  await assert.rejects(getDesignVersionImage(db, clerk, id, 1, 0), isError(403));
  await assert.rejects(getDesignVersionImage(db, customer, id, 2, 0), isError(404));
  await getDesignVersionImage(db, admin, id, 1, 0);
  await respondToDesign(db, customer, id, { decision: "changes", note: "Add a second bathroom." });
  await assert.rejects(respondToDesign(db, customer, id, { decision: "approved" }), isError(409));
  assert.equal(await db.collection("notifications").countDocuments({ kind: "design-changes" }), 1);
  const workflow = await getDesignWorkflow(db, admin, id);
  assert.equal(workflow.status, "Changes requested");
  assert.equal(workflow.versions[0].response?.note, "Add a second bathroom.");
  await assert.rejects(getDesignWorkflow(db, customer, id), isError(403));
});

test("design versions need an approved feasibility record and blueprint files need an approved design", async () => {
  const id = await designFixture();
  await db.collection("approvals").deleteMany({});
  await assert.rejects(uploadDesignVersion(db, admin, id, { images: [privateImage] }), isError(409));
  assert.equal(await db.collection("design_versions").countDocuments(), 0);
  assert.equal(await db.collection("notifications").countDocuments(), 0);
  await assert.rejects(uploadBlueprintFile(db, admin, id, { name: "plan.pdf", dataUrl: blueprintPdf }), isError(409));
  await db.collection("design_requests").updateOne({ _id: new ObjectId(id) }, { $set: { status: "Design approved" } });
  await assert.rejects(uploadBlueprintFile(db, customer, id, { name: "plan.pdf", dataUrl: blueprintPdf }), isError(403));
  await assert.rejects(uploadBlueprintFile(db, admin, id, { name: "fake.pdf", dataUrl: "data:application/pdf;base64,aGVsbG8=" }), isError(400));
  await assert.rejects(submitBlueprint(db, admin, id), isError(409));
  const file = await uploadBlueprintFile(db, admin, id, { name: "plan.pdf", dataUrl: blueprintPdf });
  // Before submitting, files can still be removed.
  await deleteBlueprintFile(db, admin, id, file.id);
  assert.equal(await db.collection("blueprint_files").countDocuments(), 0);
  // The blueprint is submitted right after the design is approved; no construction estimate is needed.
  const kept = await uploadBlueprintFile(db, admin, id, { name: "plan.pdf", dataUrl: blueprintPdf });
  await submitBlueprint(db, admin, id);
  assert.equal(await db.collection("notifications").countDocuments({ kind: "blueprint-fee" }), 1);
  await assert.rejects(deleteBlueprintFile(db, admin, id, kept.id), isError(409));
});

test("design fees require completed work, remain separate from contracts, and have only one active invoice", async () => {
  const id = await designFixture();
  await assert.rejects(createInvoice(db, clerk, feeInput(id)), isError(409));
  await deliverLegacy(id);
  await assert.rejects(createInvoice(db, admin, feeInput(id)), isError(403));
  const results = await Promise.allSettled([1, 2].map(() => createInvoice(db, clerk, feeInput(id))));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const billing = await getBillingData(db, clerk);
  assert.equal(billing.projects[0].allocated, 0);
  assert.equal(billing.designRequests[0].invoiceId, billing.invoices[0].id);
  assert.equal((await listCustomerDesigns(db, customer))[0].invoice, null);
  await assert.rejects(createInvoice(db, clerk, { ...feeInput(id), projectId: projectId.toHexString() }));
  await assert.rejects(createInvoice(db, clerk, { ...feeInput(id), amount: 0 }));
});

test("pending and partial payments stay locked; verified full payment unlocks only the owner's images and issues receipts", async () => {
  const { designId, invoiceId } = await deliveredFee();
  const first = await submitPayment(db, customer, payment(invoiceId, 2000));
  assert.equal((await listCustomerDesigns(db, customer))[0].invoice?.pending, 1);
  await assert.rejects(getCustomerDesignImage(db, customer, designId, 0), isError(403));
  await reviewPayment(db, clerk, first, { action: "verify" });
  assert.equal((await listCustomerDesigns(db, customer))[0].access, "payment-required");
  await assert.rejects(getCustomerDesignImage(db, customer, designId, 0), isError(403));
  const second = await submitPayment(db, customer, payment(invoiceId, 3000));
  await reviewPayment(db, clerk, second, { action: "verify" });
  const requests = await listCustomerDesigns(db, customer);
  assert.equal(requests[0].access, "unlocked");
  assert.ok(!JSON.stringify(requests).includes(privateImage));
  assert.deepEqual((await getCustomerDesignImage(db, customer, designId, 0)).bytes, Buffer.from(privateImage.split(",")[1], "base64"));
  assert.equal((await getReceipt(db, customer, second)).receipt.balanceAfterPayment, 0);
  assert.equal((await getBillingData(db, clerk)).projects[0].paid, 0);
  assert.deepEqual(await listCustomerDesigns(db, other), []);
  await assert.rejects(getCustomerDesignImage(db, other, designId, 0), isError(404));
  await assert.rejects(getCustomerDesignImage(db, admin, designId, 0), isError(403));
  await assert.rejects(getCustomerDesignImage(db, clerk, designId, 0), isError(403));
  await assert.rejects(getCustomerDesignImage(db, customer, designId, -1), isError(404));
  assert.equal(await db.collection("notifications").countDocuments({ kind: "design-access", title: "Your house design is unlocked" }), 1);
});

test("payment reversal immediately locks design access again and preserves the void receipt", async () => {
  const { designId, invoiceId } = await deliveredFee();
  const id = await submitPayment(db, customer, payment(invoiceId, 5000));
  await reviewPayment(db, clerk, id, { action: "verify" });
  await getCustomerDesignImage(db, customer, designId, 0);
  await reviewPayment(db, clerk, id, { action: "reverse", reason: "Payment returned to sender" });
  assert.equal((await listCustomerDesigns(db, customer))[0].access, "payment-required");
  await assert.rejects(getCustomerDesignImage(db, customer, designId, 0), isError(403));
  assert.equal((await getReceipt(db, customer, id)).status, "Reversed");
});

test("a paid invoice for another design or a construction payment cannot unlock a request", async () => {
  const { designId, invoiceId } = await deliveredFee();
  const otherId = await designFixture();
  await deliverLegacy(otherId);
  const id = await submitPayment(db, customer, payment(invoiceId, 5000));
  await reviewPayment(db, clerk, id, { action: "verify" });
  await getCustomerDesignImage(db, customer, designId, 0);
  await assert.rejects(getCustomerDesignImage(db, customer, otherId, 0), isError(403));
  const construction = await issuedInvoice();
  const constructionPayment = await submitPayment(db, customer, payment(construction, 100000));
  await reviewPayment(db, clerk, constructionPayment, { action: "verify" });
  await assert.rejects(getCustomerDesignImage(db, customer, otherId, 0), isError(403));
});

test("void fee invoices stay locked, and a replacement draft can be prepared and edited", async () => {
  const { designId, invoiceId } = await deliveredFee();
  await changeInvoice(db, clerk, invoiceId, { action: "void", reason: "Incorrect agreed design fee" });
  await assert.rejects(getCustomerDesignImage(db, customer, designId, 0), isError(403));
  const replacement = await createInvoice(db, clerk, feeInput(designId));
  await changeInvoice(db, clerk, replacement, { action: "edit", invoice: { ...feeInput(designId), amount: 6000 } });
  await changeInvoice(db, clerk, replacement, { action: "issue" });
  assert.equal((await listCustomerDesigns(db, customer))[0].invoice?.amount, 6000);
  await assert.rejects(changeInvoice(db, clerk, replacement, { action: "edit", invoice: feeInput(designId) }), isError(409));
});

test("legacy completed images require a real verified fee; a Paid status alone cannot unlock them", async () => {
  const id = await designFixture("Completed");
  await db.collection("design_requests").updateOne({ _id: new ObjectId(id) }, { $set: { completedDesignImage: privateImage } });
  assert.equal((await listCustomerDesigns(db, customer))[0].access, "awaiting-invoice");
  const fee = await createInvoice(db, clerk, feeInput(id));
  await changeInvoice(db, clerk, fee, { action: "issue" });
  await db.collection("invoices").updateOne({ _id: new ObjectId(fee) }, { $set: { status: "Paid" } });
  await assert.rejects(getCustomerDesignImage(db, customer, id, 0), isError(403));
  const paymentId = await submitPayment(db, customer, payment(fee, 5000));
  await reviewPayment(db, clerk, paymentId, { action: "verify" });
  await getCustomerDesignImage(db, customer, id, 0);
});

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_billing_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_billing_tests");
  await Promise.all(["house_designs", "design_requests", "users", "projects", "invoices", "payments", "cash_reports", "approvals", "audit_logs", "notifications", "billing_counters", "design_versions", "blueprint_files", "cost_estimates"].map((name) => db.collection(name).deleteMany({})));
  const now = new Date();
  await db.collection<UserDocument>("users").insertMany([clerk, customer, other, admin].map((actor) => ({
    _id: new ObjectId(actor.id), name: actor.name, email: actor.email, role: actor.role, status: "active", createdAt: now, updatedAt: now,
  })));
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: projectId, reference: "PRJ-001", name: "Test residence", customerId: new ObjectId(customer.id),
    status: "Active", contractPrice: 200000, createdAt: now, updatedAt: now,
  });
});
after(async () => { await db?.client.close(); await mongo?.stop(); });
async function issuedInvoice(amount = 100000) {
  const id = await createInvoice(db, clerk, { ...draft, amount });
  await changeInvoice(db, clerk, id, { action: "issue" });
  return id;
}
function payment(invoiceId: string, amount = 40000, extra = {}) {
  return { invoiceId, amount, method: "Bank transfer", transactionReference: randomUUID(), paidAt: manilaDate(), submissionKey: randomUUID(), ...extra };
}
/** Cash the clerk records at the counter; it is verified with a receipt as it is saved. */
function recordCash(invoiceId: string, amount: number) {
  return submitPayment(db, clerk, { invoiceId, amount, method: "Cash", transactionReference: "", submissionKey: randomUUID(), cashReceived: true });
}

test("customers get one automatic reminder when an unpaid invoice is 3 days or fewer from its due date", async () => {
  const now = new Date("2026-10-15T00:30:00.000Z"); // 8:30 AM, October 15 in Manila
  const setDue = (id: string, date: string) =>
    db.collection<InvoiceDocument>("invoices").updateOne({ _id: new ObjectId(id) }, { $set: { dueDate: new Date(`${date}T00:00:00.000Z`) } });
  const inThreeDays = await issuedInvoice(40000);
  const inFiveDays = await createInvoice(db, clerk, { ...draft, label: "Roofing works", amount: 20000 });
  await changeInvoice(db, clerk, inFiveDays, { action: "issue" });
  const paid = await createInvoice(db, clerk, { ...draft, label: "Painting works", amount: 10000 });
  await changeInvoice(db, clerk, paid, { action: "issue" });
  const paidPayment = await submitPayment(db, customer, payment(paid, 10000));
  await reviewPayment(db, clerk, paidPayment, { action: "verify" });
  const unissued = await createInvoice(db, clerk, { ...draft, label: "Tiling works", amount: 5000 });
  await Promise.all([setDue(inThreeDays, "2026-10-18"), setDue(inFiveDays, "2026-10-20"), setDue(paid, "2026-10-16"), setDue(unissued, "2026-10-16")]);

  const reminders = () => db.collection("notifications").find({ kind: "payment-due-reminder" }).toArray();
  assert.equal((await sendDuePaymentReminders(db, now)).sent, 1);
  const [first] = await reminders();
  assert.equal(first.userId.toHexString(), customer.id);
  assert.equal(first.entityId.toHexString(), inThreeDays);
  assert.equal(first.title, "Payment due in 3 days");
  assert.match(first.body, /₱40,000/);

  // Running again, even the same day, sends nothing new.
  assert.equal((await sendDuePaymentReminders(db, now)).sent, 0);
  // Two days later the second invoice enters the window; the first is not reminded twice.
  assert.equal((await sendDuePaymentReminders(db, new Date("2026-10-17T00:30:00.000Z"))).sent, 1);
  assert.deepEqual((await reminders()).map((note) => note.entityId.toHexString()).sort(), [inThreeDays, inFiveDays].sort());
  // A new due date gets its own reminder.
  await setDue(inThreeDays, "2026-10-19");
  assert.equal((await sendDuePaymentReminders(db, new Date("2026-10-17T00:30:00.000Z"))).sent, 1);
});

test("only clerk manages billing; customers submit only their own payments", async () => {
  assert.throws(() => assertBillingRole(admin, true), isError(403));
  assert.throws(() => assertBillingRole(customer), isError(403));
  assert.doesNotThrow(() => assertBillingRole(customer, true));
  await assert.rejects(createInvoice(db, admin, draft), isError(403));
  await assert.rejects(getBillingData(db, admin), isError(403));
  await assert.rejects(createInvoice(db, customer, draft), isError(403));
  const id = await issuedInvoice();
  await assert.rejects(submitPayment(db, other, payment(id)), isError(404));
  await assert.rejects(submitPayment(db, customer, payment(id, 1000, { method: "Cash", transactionReference: "" })), isError(400));
});
test("drafts are private; clerk issues without admin approval; issued records cannot be edited", async () => {
  const id = await createInvoice(db, clerk, draft);
  assert.equal((await getBillingData(db, customer)).invoices.length, 0);
  await assert.rejects(submitPayment(db, customer, payment(id)), isError(400));
  await changeInvoice(db, clerk, id, { action: "edit", invoice: { ...draft, label: "Approved foundation work" } });
  await changeInvoice(db, clerk, id, { action: "issue" });
  const data = await getBillingData(db, customer);
  assert.equal(data.invoices[0].status, "Sent");
  assert.equal(data.invoices[0].label, "Approved foundation work");
  assert.equal(await db.collection("approvals").countDocuments(), 0);
  assert.equal((await getBillingData(db, other)).invoices.length, 0);
  await assert.rejects(changeInvoice(db, clerk, id, { action: "edit", invoice: draft }), isError(409));
  await assert.rejects(changeInvoice(db, clerk, id, { action: "issue" }), isError(409));
});
test("partial payments get separate immutable receipts; pending payments do not reduce balances", async () => {
  const id = await issuedInvoice();
  const first = await submitPayment(db, customer, payment(id));
  assert.equal((await getBillingData(db, clerk)).invoices[0].balance, 100000);
  await assert.rejects(getReceipt(db, clerk, first), isError(404));
  await reviewPayment(db, clerk, first, { action: "verify" });
  const firstReceipt = await getReceipt(db, customer, first);
  assert.equal(firstReceipt.receipt.amount, 40000);
  assert.equal(firstReceipt.receipt.balanceAfterPayment, 60000);
  assert.equal((await getBillingData(db, clerk)).invoices[0].status, "Partially Paid");
  const second = await submitPayment(db, customer, payment(id, 60000, { method: "Cheque" }));
  await reviewPayment(db, clerk, second, { action: "verify" });
  const data = await getBillingData(db, customer);
  assert.equal(data.invoices[0].balance, 0);
  assert.equal(data.invoices[0].status, "Paid");
  assert.notEqual((await getReceipt(db, customer, second)).receipt.number, firstReceipt.receipt.number);
  assert.deepEqual(await getReceipt(db, customer, first), firstReceipt);
  await assert.rejects(reviewPayment(db, clerk, first, { action: "verify" }), isError(409));
  assert.equal(await db.collection("payments").countDocuments({ "receipt.number": { $exists: true } }), 2);
});
test("customers submit only bank transfers and cheques; card and e-wallet payments go through Pay online", async () => {
  const id = await issuedInvoice();
  for (const method of ["Card", "E-wallet"]) await assert.rejects(submitPayment(db, customer, payment(id, 1000, { method })), isError(400));
  await submitPayment(db, customer, payment(id, 1000, { method: "Cheque" }));
  assert.equal(await db.collection("payments").countDocuments(), 1);
});
test("cash recorded by the clerk needs the counted-cash confirmation and is verified with a receipt in the same step", async () => {
  const id = await issuedInvoice();
  const cash = { method: "Cash", transactionReference: "" };
  await assert.rejects(submitPayment(db, clerk, payment(id, 40000, cash)), isError(400));
  const paymentId = await submitPayment(db, clerk, payment(id, 40000, { ...cash, cashReceived: true }));
  const { receipt } = await getReceipt(db, customer, paymentId);
  assert.equal(receipt.method, "Cash");
  assert.equal(receipt.amount, 40000);
  assert.equal(receipt.balanceAfterPayment, 60000);
  assert.equal(receipt.verifiedByName, clerk.name);
  const data = await getBillingData(db, customer);
  assert.equal(data.payments[0].status, "Verified");
  assert.equal(receipt.transactionReference, data.payments[0].reference);
  assert.equal(data.invoices[0].balance, 60000);
  assert.equal(data.invoices[0].status, "Partially Paid");
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "payment.verify" }), 1);
});
test("the clerk records cash only, dated by the server when it is saved", async () => {
  const id = await issuedInvoice();
  // Customers submit transfers and cheques themselves and pay by card or e-wallet online.
  for (const method of ["Bank transfer", "Cheque", "Card", "E-wallet"]) await assert.rejects(submitPayment(db, clerk, payment(id, 1000, { method })), isError(400));
  const before = Date.now();
  const paymentId = await submitPayment(db, clerk, payment(id, 1000, { method: "Cash", transactionReference: "", cashReceived: true, paidAt: "2020-01-01" }));
  const saved = await db.collection<PaymentDocument>("payments").findOne({ _id: new ObjectId(paymentId) });
  assert.ok(saved!.paidAt.getTime() >= before);
  assert.equal(saved!.uncountedCash, true);
  // Transfers and cheques still need the date they were paid.
  assert.equal(paymentInputSchema.safeParse(payment(id, 1, { paidAt: undefined })).success, false);
  assert.equal(paymentInputSchema.safeParse(payment(id, 1, { method: "Cash", transactionReference: "", paidAt: undefined })).success, true);
});
test("the clerk counts recorded cash into a daily cash report that only the Admin verifies", async () => {
  const id = await issuedInvoice();
  const first = await recordCash(id, 25000);
  const voided = await recordCash(id, 12500);
  await reviewPayment(db, clerk, voided, { action: "reverse", reason: "Recorded on the wrong invoice." });
  const third = await recordCash(id, 8000);
  // Cash recorded before daily reports existed is never counted.
  await db.collection<PaymentDocument>("payments").insertOne({ _id: new ObjectId(), reference: "LEGACY-CASH", customerId: new ObjectId(customer.id), amount: 500, method: "Cash", status: "Verified", paidAt: new Date(), createdAt: new Date(), verifiedBy: new ObjectId(clerk.id) });

  const { cashDrawer } = await getClerkCashSummary(db, clerk);
  assert.equal(cashDrawer.expected, 33000);
  assert.deepEqual(cashDrawer.payments.map((item) => item.id), [first, voided, third]);
  assert.equal(cashDrawer.payments[1].status, "Reversed");
  const input = { paymentIds: cashDrawer.payments.map((item) => item.id), expected: cashDrawer.expected };

  await assert.rejects(getClerkCashSummary(db, admin), isError(403));
  await assert.rejects(submitCashReport(db, admin, { ...input, counted: 33000 }), isError(403));
  await assert.rejects(submitCashReport(db, customer, { ...input, counted: 33000 }), isError(403));
  // A short count needs an explanation, and a count against an out-of-date list of cash is refused.
  await assert.rejects(submitCashReport(db, clerk, { ...input, counted: 32800 }), isError(400));
  await assert.rejects(submitCashReport(db, clerk, { ...input, expected: 45500, counted: 45500 }), isError(409));
  await assert.rejects(submitCashReport(db, clerk, { ...input, paymentIds: [first, third], counted: 33000 }), isError(409));

  const reportId = await submitCashReport(db, clerk, { ...input, counted: 32800, explanation: "Gave too much change on one payment." });
  const summary = await getClerkCashSummary(db, clerk);
  assert.equal(summary.cashDrawer.payments.length, 0);
  assert.equal(summary.cashReports[0].difference, -200);
  assert.equal(summary.cashReports[0].status, "Pending");
  await assert.rejects(submitCashReport(db, clerk, { ...input, counted: 32800, explanation: "Counted again." }), isError(409));
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(admin.id), kind: "cash-report" }), 1);
  // Cash recorded after the report waits for the next one.
  const later = await recordCash(id, 1000);
  assert.deepEqual((await getClerkCashSummary(db, clerk)).cashDrawer.payments.map((item) => item.id), [later]);

  await assert.rejects(verifyCashReport(db, clerk, reportId, { received: true, note: "Shortage noted." }), isError(403));
  await assert.rejects(verifyCashReport(db, admin, reportId, { note: "Shortage noted." }), ZodError);
  await assert.rejects(verifyCashReport(db, admin, reportId, { received: true }), isError(400));
  await verifyCashReport(db, admin, reportId, { received: true, note: "Shortage of ₱200.00 noted." });
  const [report] = await listCashReports(db, admin);
  assert.equal(report.status, "Verified");
  assert.equal(report.verifiedByName, admin.name);
  assert.equal(report.adminNote, "Shortage of ₱200.00 noted.");
  assert.deepEqual(report.payments.map((item) => item.id), [first, voided, third]);
  await assert.rejects(verifyCashReport(db, admin, reportId, { received: true, note: "Verified again." }), isError(409));
  await assert.rejects(listCashReports(db, clerk), isError(403));
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(clerk.id), kind: "cash-report" }), 1);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: { $in: ["cash-report.submitted", "cash-report.verified"] } }), 2);
});
test("concurrent verification cannot overpay an invoice", async () => {
  const id = await issuedInvoice();
  const first = await submitPayment(db, customer, payment(id, 70000));
  const second = await submitPayment(db, customer, payment(id, 70000));
  const results = await Promise.allSettled([first, second].map((paymentId) => reviewPayment(db, clerk, paymentId, { action: "verify" })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const data = await getBillingData(db, clerk);
  assert.equal(data.invoices[0].balance, 30000);
  assert.equal(data.payments.filter((item) => item.status === "Verified").length, 1);
  assert.equal(data.payments.filter((item) => item.status === "Pending").length, 1);
});
test("simultaneous review of the same payment creates one receipt and one audit event", async () => {
  const id = await issuedInvoice();
  const paymentId = await submitPayment(db, customer, payment(id));
  const results = await Promise.allSettled([1, 2].map(() => reviewPayment(db, clerk, paymentId, { action: "verify" })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "payment.verify" }), 1);
  assert.equal((await getBillingData(db, clerk)).invoices[0].paid, 40000);
});
test("submission retries are idempotent and repeated transaction references are rejected", async () => {
  const id = await issuedInvoice();
  const input = payment(id);
  const first = await submitPayment(db, customer, input);
  assert.equal(await submitPayment(db, customer, input), first);
  assert.equal(await db.collection("payments").countDocuments(), 1);
  await assert.rejects(submitPayment(db, customer, { ...input, amount: 10 }), isError(409));
  await assert.rejects(submitPayment(db, customer, { ...input, submissionKey: randomUUID() }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === 11000));
});
test("reversals restore balances and preserve the original receipt", async () => {
  const id = await issuedInvoice();
  const paymentId = await submitPayment(db, customer, payment(id, 100000));
  await reviewPayment(db, clerk, paymentId, { action: "verify" });
  const original = await getReceipt(db, clerk, paymentId);
  await reviewPayment(db, clerk, paymentId, { action: "reverse", reason: "Payment was returned by the bank." });
  const reversed = await getReceipt(db, clerk, paymentId);
  assert.deepEqual(reversed.receipt, original.receipt);
  assert.equal(reversed.status, "Reversed");
  assert.match(receiptHtml(reversed), /VOID PAYMENT/);
  assert.equal((await getBillingData(db, clerk)).invoices[0].balance, 100000);
  await assert.rejects(reviewPayment(db, clerk, paymentId, { action: "reverse", reason: "Repeated reversal" }), isError(409));
});
test("a reversed payment can be re-recorded against the correct invoice without changing its original receipt", async () => {
  const id = await issuedInvoice();
  const originalInput = payment(id, 50000);
  const originalId = await submitPayment(db, customer, originalInput);
  await reviewPayment(db, clerk, originalId, { action: "verify" });
  const originalReceipt = await getReceipt(db, clerk, originalId);
  await reviewPayment(db, clerk, originalId, { action: "reverse", reason: "Payment was allocated to the wrong invoice." });
  const correctedInvoice = await createInvoice(db, clerk, { ...draft, label: "Correct milestone", amount: 50000 });
  await changeInvoice(db, clerk, correctedInvoice, { action: "issue" });
  const correctedId = await submitPayment(db, customer, { ...originalInput, invoiceId: correctedInvoice, submissionKey: randomUUID() });
  await reviewPayment(db, clerk, correctedId, { action: "verify" });
  assert.deepEqual((await getReceipt(db, clerk, originalId)).receipt, originalReceipt.receipt);
  const records = await getBillingData(db, clerk);
  assert.equal(records.invoices.find((invoice) => invoice.id === id)?.balance, 100000);
  assert.equal(records.invoices.find((invoice) => invoice.id === correctedInvoice)?.balance, 0);
});
test("rejection leaves balances unchanged and allows corrected submission", async () => {
  const id = await issuedInvoice();
  const input = payment(id);
  const paymentId = await submitPayment(db, customer, input);
  await reviewPayment(db, clerk, paymentId, { action: "reject", reason: "Transaction reference could not be confirmed." });
  await assert.rejects(getReceipt(db, clerk, paymentId), isError(404));
  assert.equal((await getBillingData(db, customer)).invoices[0].balance, 100000);
  assert.notEqual(await submitPayment(db, customer, { ...input, submissionKey: randomUUID() }), paymentId);
});
test("active payments block invoice voiding; draft and issued history is retained", async () => {
  const id = await issuedInvoice();
  const paymentId = await submitPayment(db, customer, payment(id));
  await assert.rejects(changeInvoice(db, clerk, id, { action: "void", reason: "Incorrect milestone selected" }), isError(409));
  await reviewPayment(db, clerk, paymentId, { action: "reject", reason: "Invoice must be corrected." });
  await changeInvoice(db, clerk, id, { action: "void", reason: "Incorrect milestone selected" });
  assert.equal((await getBillingData(db, customer)).invoices[0].status, "Void");
  assert.equal((await getBillingData(db, customer)).projects[0].outstanding, 0);
  assert.equal(await db.collection("payments").countDocuments(), 1);
  const privateDraft = await createInvoice(db, clerk, { ...draft, label: "Private draft" });
  await changeInvoice(db, clerk, privateDraft, { action: "void", reason: "Duplicate preparation" });
  assert.equal((await getBillingData(db, customer)).invoices.length, 1);
});
test("contract allocation is atomic and includes drafts; duplicate billing stages are blocked", async () => {
  await db.collection("projects").updateOne({ _id: projectId }, { $set: { contractPrice: 100000 } });
  const results = await Promise.allSettled(["Stage A", "Stage B"].map((label) => createInvoice(db, clerk, { ...draft, label, amount: 70000 })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const invoice = await db.collection<InvoiceDocument>("invoices").findOne({});
  await assert.rejects(createInvoice(db, clerk, { ...draft, label: invoice!.label.toUpperCase(), amount: 1 }), isError(409));
  assert.equal((await getBillingData(db, clerk)).projects[0].allocated, 70000);
});
test("centavo arithmetic is exact; invalid precision, dates, proofs and overposting are rejected", async () => {
  const id = await issuedInvoice(0.3);
  for (const amount of [0.1, 0.2]) {
    const paymentId = await submitPayment(db, customer, payment(id, amount));
    await reviewPayment(db, clerk, paymentId, { action: "verify" });
  }
  assert.equal((await getBillingData(db, clerk)).invoices[0].balance, 0);
  assert.equal(invoiceInputSchema.safeParse({ ...draft, amount: 1.001 }).success, false);
  assert.equal(invoiceInputSchema.safeParse({ ...draft, status: "Paid" }).success, false);
  assert.equal(paymentInputSchema.safeParse(payment(id, 1, { paidAt: "2099-12-31" })).success, false);
  assert.equal(paymentInputSchema.safeParse(payment(id, 1, { proofImage: "data:image/svg+xml;base64,PHN2Zz4=" })).success, false);
});
test("receipt/proof ownership is enforced and downloaded HTML escapes customer content", async () => {
  const id = await issuedInvoice();
  const paymentId = await submitPayment(db, customer, payment(id));
  await reviewPayment(db, clerk, paymentId, { action: "verify" });
  await assert.rejects(getReceipt(db, other, paymentId), isError(404));
  await assert.rejects(getOwnedPayment(db, other, paymentId), isError(404));
  await assert.rejects(getReceipt(db, admin, paymentId), isError(403));
  await assert.rejects(reviewPayment(db, customer, paymentId, { action: "reverse", reason: "Unauthorized reversal" }), isError(403));
  const receipt = await getReceipt(db, customer, paymentId);
  assert.equal(receipt.receipt.customerName, customer.name);
  const escaped = receiptHtml({ ...receipt, receipt: { ...receipt.receipt, customerName: '<script>alert("test")</script>' } });
  assert.equal(escaped.includes("<script>"), false);
  assert.match(escaped, /&lt;script&gt;/);
});
test("overdue state covers partial balances and uses the Manila date", () => {
  const invoice = { amount: 100, status: "Sent" as const, dueDate: new Date("2026-09-29T00:00:00Z") };
  assert.deepEqual(invoiceState(invoice, 20, new Date("2026-09-29T16:00:00Z")), { balance: 80, status: "Partially Paid", overdue: true });
  assert.equal(invoiceState(invoice, 100).overdue, false);
  assert.equal(invoiceState({ ...invoice, status: "Draft" }, 0).overdue, false);
});
test("payment reminders are limited to one per invoice per day", async () => {
  const id = await issuedInvoice();
  await changeInvoice(db, clerk, id, { action: "remind" });
  await assert.rejects(changeInvoice(db, clerk, id, { action: "remind" }), isError(409));
  assert.equal(await db.collection("notifications").countDocuments({ title: "Payment reminder" }), 1);
});
test("unallocated legacy payments stay visible without fabricated receipts", async () => {
  const now = new Date();
  const id = new ObjectId();
  await db.collection<PaymentDocument>("payments").insertOne({ _id: id, reference: "LEGACY-01", projectId, customerId: new ObjectId(customer.id), amount: 500, method: "Cash", status: "Verified", paidAt: now, createdAt: now });
  assert.equal((await getBillingData(db, clerk)).payments[0].invoiceId, null);
  await assert.rejects(reviewPayment(db, clerk, id.toHexString(), { action: "reverse", reason: "Cannot reallocate silently" }), isError(409));
  await assert.rejects(getReceipt(db, clerk, id.toHexString()), isError(404));
});
