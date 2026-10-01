import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";
import { type DesignRequestDocument, type ApprovalDocument, type InvoiceDocument, type PaymentDocument, type ProjectDocument, type UserDocument } from "@/lib/database/collections";
import { BillingError, assertBillingRole, changeInvoice, createInvoice, getBillingData, getOwnedPayment, getReceipt, invoiceInputSchema, paymentInputSchema, reviewPayment, submitPayment } from "@/lib/server/billing";
import { invoiceState, manilaDate } from "@/lib/billing";
import { receiptHtml } from "@/lib/server/billing-receipt";
import { deliverDesign, listCustomerDesigns, getCustomerDesignImage } from "@/lib/server/design-requests";
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

const privateImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT1cAAAAASUVORK5CYII=";
async function designFixture(status: DesignRequestDocument["status"] = "Approved") {
  const now = new Date();
  const id = new ObjectId();
  await db.collection<DesignRequestDocument>("design_requests").insertOne({
    _id: id, customerId: new ObjectId(customer.id), floorArea: 120, rooms: "3 bedrooms, 2 bathrooms",
    finish: "Standard", notes: "Requested courtyard home", status, createdAt: now, updatedAt: now,
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
async function deliveredFee() {
  const designId = await designFixture();
  await deliverDesign(db, admin, designId, { images: [privateImage] });
  const invoiceId = await createInvoice(db, clerk, feeInput(designId));
  await changeInvoice(db, clerk, invoiceId, { action: "issue" });
  return { designId, invoiceId };
}

test("only admin can deliver an approved request; completion notifies the customer and clerk without unlocking", async () => {
  const id = await designFixture("Pending");
  await assert.rejects(deliverDesign(db, customer, id, { images: [privateImage] }), isError(403));
  await assert.rejects(deliverDesign(db, clerk, id, { images: [privateImage] }), isError(403));
  await assert.rejects(deliverDesign(db, admin, id, { images: [privateImage] }), isError(409));
  await db.collection("design_requests").updateOne({ _id: new ObjectId(id) }, { $set: { status: "Approved" } });
  await deliverDesign(db, admin, id, { images: [privateImage] });
  const requests = await listCustomerDesigns(db, customer);
  assert.equal(requests[0].access, "awaiting-invoice");
  assert.equal(requests[0].imageCount, 1);
  assert.ok(!JSON.stringify(requests).includes(privateImage));
  assert.equal(await db.collection("notifications").countDocuments({ kind: "design-fee" }), 1);
  await assert.rejects(deliverDesign(db, admin, id, { images: [privateImage] }), isError(409));
  await assert.rejects(getCustomerDesignImage(db, customer, id, 0), isError(403));
});

test("delivering without an approved source does not store images or send notifications", async () => {
  const id = await designFixture();
  await db.collection("approvals").deleteMany({});
  await assert.rejects(deliverDesign(db, admin, id, { images: [privateImage] }), isError(409));
  assert.equal((await db.collection("design_requests").findOne({ _id: new ObjectId(id) }))?.completedDesignImages, undefined);
  assert.equal(await db.collection("notifications").countDocuments(), 0);
});

test("design fees require completed work, remain separate from contracts, and have only one active invoice", async () => {
  const id = await designFixture();
  await assert.rejects(createInvoice(db, clerk, feeInput(id)), isError(409));
  await deliverDesign(db, admin, id, { images: [privateImage] });
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
  await deliverDesign(db, admin, otherId, { images: [privateImage] });
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
  await Promise.all(["design_requests", "users", "projects", "invoices", "payments", "approvals", "audit_logs", "notifications", "billing_counters"].map((name) => db.collection(name).deleteMany({})));
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
  await assert.rejects(submitPayment(db, clerk, payment(id)), isError(400));
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
  const second = await submitPayment(db, customer, payment(id, 60000, { method: "E-wallet" }));
  await reviewPayment(db, clerk, second, { action: "verify" });
  const data = await getBillingData(db, customer);
  assert.equal(data.invoices[0].balance, 0);
  assert.equal(data.invoices[0].status, "Paid");
  assert.notEqual((await getReceipt(db, customer, second)).receipt.number, firstReceipt.receipt.number);
  assert.deepEqual(await getReceipt(db, customer, first), firstReceipt);
  await assert.rejects(reviewPayment(db, clerk, first, { action: "verify" }), isError(409));
  assert.equal(await db.collection("payments").countDocuments({ "receipt.number": { $exists: true } }), 2);
});
test("concurrent verification cannot overpay an invoice", async () => {
  const id = await issuedInvoice();
  const first = await submitPayment(db, clerk, payment(id, 70000));
  const second = await submitPayment(db, clerk, payment(id, 70000));
  const results = await Promise.allSettled([first, second].map((paymentId) => reviewPayment(db, clerk, paymentId, { action: "verify" })));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const data = await getBillingData(db, clerk);
  assert.equal(data.invoices[0].balance, 30000);
  assert.equal(data.payments.filter((item) => item.status === "Verified").length, 1);
  assert.equal(data.payments.filter((item) => item.status === "Pending").length, 1);
});
test("simultaneous review of the same payment creates one receipt and one audit event", async () => {
  const id = await issuedInvoice();
  const paymentId = await submitPayment(db, clerk, payment(id));
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
  const paymentId = await submitPayment(db, clerk, payment(id, 100000));
  await reviewPayment(db, clerk, paymentId, { action: "verify" });
  const original = await getReceipt(db, clerk, paymentId);
  await reviewPayment(db, clerk, paymentId, { action: "reverse", reason: "Payment was returned by the bank." });
  const reversed = await getReceipt(db, clerk, paymentId);
  assert.deepEqual(reversed.receipt, original.receipt);
  assert.equal(reversed.status, "Reversed");
  assert.match(receiptHtml(reversed), /VOID — PAYMENT REVERSED/);
  assert.equal((await getBillingData(db, clerk)).invoices[0].balance, 100000);
  await assert.rejects(reviewPayment(db, clerk, paymentId, { action: "reverse", reason: "Repeated reversal" }), isError(409));
});
test("a reversed payment can be re-recorded against the correct invoice without changing its original receipt", async () => {
  const id = await issuedInvoice();
  const originalInput = payment(id, 50000);
  const originalId = await submitPayment(db, clerk, originalInput);
  await reviewPayment(db, clerk, originalId, { action: "verify" });
  const originalReceipt = await getReceipt(db, clerk, originalId);
  await reviewPayment(db, clerk, originalId, { action: "reverse", reason: "Payment was allocated to the wrong invoice." });
  const correctedInvoice = await createInvoice(db, clerk, { ...draft, label: "Correct milestone", amount: 50000 });
  await changeInvoice(db, clerk, correctedInvoice, { action: "issue" });
  const correctedId = await submitPayment(db, clerk, { ...originalInput, invoiceId: correctedInvoice, submissionKey: randomUUID() });
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
    const paymentId = await submitPayment(db, clerk, payment(id, amount));
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
