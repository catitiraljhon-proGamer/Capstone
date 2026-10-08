import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";
import type { DesignRequestDocument, InvoiceDocument, PaymentCheckoutDocument, PaymentDocument, ProjectDocument, UserDocument } from "@/lib/database/collections";
import { BillingError, changeInvoice, createInvoice, getBillingData, reviewPayment } from "@/lib/server/billing";
import { changeEstimate, createConstructionRequest, listProjects } from "@/lib/server/construction";
import { listCustomerDesigns } from "@/lib/server/design-requests";
import { createCheckout, getCheckout, getPaymongoWebhookSecret, handlePaymongoWebhook, signPaymongoEvent, simulateCheckout, verifyPaymongoSignature } from "@/lib/server/paymongo";
import { defaultScheduleTemplate } from "@/lib/construction";
import { manilaDate } from "@/lib/billing";
import type { ConstructionProjectDto } from "@/types/construction";
import type { SessionUser } from "@/types/domain";
import type { PaymongoCheckoutDto, PaymongoMethod } from "@/types/paymongo";

let mongo: MongoMemoryReplSet;
let db: Db;
const clerk: SessionUser = { id: new ObjectId().toHexString(), name: "Billing Clerk", email: "clerk@example.test", role: "billing-clerk" };
const customer: SessionUser = { id: new ObjectId().toHexString(), name: "Test Customer", email: "customer@example.test", role: "customer" };
const other: SessionUser = { id: new ObjectId().toHexString(), name: "Other Customer", email: "other@example.test", role: "customer" };
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const projectId = new ObjectId();
const isError = (status: number) => (error: unknown) => error instanceof BillingError && error.status === status;
const address = { provinceCode: "0401000000", cityCode: "0401003000", barangayCode: "0401003001", barangay: "Baclaran", street: "123 Example Street", postalCode: "4213" };

function daysFromToday(days: number) {
  const value = new Date(`${manilaDate()}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const startDate = () => daysFromToday(30);
const neededBy = () => daysFromToday(330);

// ---------------------------------------------------------------- fixtures

async function issuedInvoice(amount = 100000) {
  const id = await createInvoice(db, clerk, {
    projectId: projectId.toHexString(), label: `Foundation work ${randomUUID().slice(0, 8)}`, basis: "Signed milestone 1 and approved site report A01",
    progressPercentage: 25, amount, dueDate: "2099-12-31",
  });
  await changeInvoice(db, clerk, id, { action: "issue" });
  return id;
}

/** A completed design whose fee invoice is issued and unpaid. */
async function unpaidDesignFee() {
  const now = new Date();
  const designId = new ObjectId();
  await db.collection<DesignRequestDocument>("design_requests").insertOne({
    _id: designId, customerId: new ObjectId(customer.id), floorArea: 120, rooms: "3 bedrooms, 2 bathrooms", finish: "Standard",
    notes: "Courtyard home", status: "Completed", completedDesignImages: ["data:image/png;base64,AAAA"], completedAt: now, createdAt: now, updatedAt: now,
  });
  const invoiceId = new ObjectId();
  await db.collection<InvoiceDocument>("invoices").insertOne({
    _id: invoiceId, invoiceNumber: `INV-FEE-${designId.toHexString().slice(-6)}`, customerId: new ObjectId(customer.id), designRequestId: designId,
    label: "House design fee", progressPercentage: 0, amount: 5000, dueDate: new Date("2099-12-31T00:00:00.000Z"), status: "Sent", issuedAt: now,
    createdAt: now, updatedAt: now,
  });
  return { designId: designId.toHexString(), invoiceId: invoiceId.toHexString() };
}

const requestInput = (designRequestId: string) => ({
  designRequestId, preferredStartDate: startDate(), neededBy: neededBy(), siteAddress: address, notes: "Corner lot near the highway",
});
async function acceptedProject() {
  const now = new Date();
  const designId = new ObjectId();
  await db.collection<DesignRequestDocument>("design_requests").insertOne({
    _id: designId, customerId: new ObjectId(customer.id), floorArea: 120, rooms: "3 bedrooms, 2 bathrooms", finish: "Standard",
    notes: "Courtyard home", status: "Completed", completedDesignImages: ["data:image/png;base64,AAAA"], completedAt: now, createdAt: now, updatedAt: now,
  });
  const invoiceId = new ObjectId();
  await db.collection<InvoiceDocument>("invoices").insertOne({
    _id: invoiceId, invoiceNumber: `INV-FEE-${designId.toHexString().slice(-6)}`, customerId: new ObjectId(customer.id), designRequestId: designId,
    label: "House design fee", progressPercentage: 0, amount: 5000, dueDate: new Date("2099-12-31T00:00:00.000Z"), status: "Paid", createdAt: now, updatedAt: now,
  });
  await db.collection<PaymentDocument>("payments").insertOne({
    _id: new ObjectId(), reference: `PAY-FEE-${designId.toHexString().slice(-6)}`, customerId: new ObjectId(customer.id), invoiceId, amount: 5000,
    method: "Cash", status: "Verified", paidAt: now, createdAt: now, verifiedAt: now,
  });
  const estimate = await createConstructionRequest(db, customer, requestInput(designId.toHexString()));
  await changeEstimate(db, admin, estimate.id, {
    action: "save", lineItems: [{ item: "Base construction", description: "Turnkey works", unit: "lot", quantity: 1, unitPrice: 6_000_000 }],
    scheduleTemplate: defaultScheduleTemplate(startDate(), neededBy()), adminNotes: "Prices valid for 30 days",
  });
  await changeEstimate(db, admin, estimate.id, { action: "send" });
  const { projectId: id } = await changeEstimate(db, customer, estimate.id, { action: "accept", downpaymentPercent: 30 });
  assert.ok(id);
  return id;
}
async function projectDto(id: string): Promise<ConstructionProjectDto> {
  const project = (await listProjects(db, clerk)).find((item) => item.id === id);
  assert.ok(project);
  return project;
}

// ---------------------------------------------------------------- events

const secret = () => getPaymongoWebhookSecret();
function paidBody(sessionId: string, amountPesos: number, extra: { eventId?: string; paymentId?: string; method?: PaymongoMethod; livemode?: boolean; status?: string } = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    data: {
      id: extra.eventId ?? `evt_test_${randomUUID()}`, type: "event",
      attributes: {
        type: "checkout_session.payment.paid", livemode: extra.livemode ?? false, created_at: seconds,
        data: {
          id: sessionId, type: "checkout_session",
          attributes: {
            reference_number: "INV", metadata: {},
            payments: [{ id: extra.paymentId ?? `pay_test_${randomUUID()}`, type: "payment", attributes: {
              amount: Math.round(amountPesos * 100), currency: "PHP", status: extra.status ?? "paid", paid_at: seconds, source: { type: extra.method ?? "gcash" },
            } }],
            payment_method_used: extra.method ?? "gcash",
          },
        },
      },
    },
  });
}
const deliver = (body: string) => handlePaymongoWebhook(db, body, signPaymongoEvent(body, secret()));
async function checkoutFor(invoiceId: string, extra: Record<string, unknown> = {}): Promise<PaymongoCheckoutDto> {
  return createCheckout(db, customer, { invoiceId, ...extra });
}
const paymentsFor = (invoiceId: string) => db.collection<PaymentDocument>("payments").find({ invoiceId: new ObjectId(invoiceId) }).toArray();
const storedCheckout = (sessionId: string) => db.collection<PaymentCheckoutDocument>("payment_checkouts").findOne({ sessionId });

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_paymongo_tests";
  process.env.AUTH_SECRET = "test-only-auth-secret-that-is-long-enough-for-hmac";
  delete process.env.PAYMONGO_WEBHOOK_SECRET;
  delete process.env.PAYMONGO_SIMULATOR;
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_paymongo_tests");
  delete process.env.PAYMONGO_SIMULATOR;
  await Promise.all(["design_requests", "users", "projects", "invoices", "payments", "approvals", "audit_logs", "notifications", "billing_counters", "cost_estimates", "schedules", "payment_checkouts"]
    .map((name) => db.collection(name).deleteMany({})));
  const now = new Date();
  await db.collection<UserDocument>("users").insertMany([clerk, customer, other, admin].map((actor) => ({
    _id: new ObjectId(actor.id), name: actor.name, email: actor.email, role: actor.role, status: "active", createdAt: now, updatedAt: now,
  })));
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: projectId, reference: "PRJ-001", name: "Test residence", customerId: new ObjectId(customer.id),
    status: "Active", contractPrice: 400000, createdAt: now, updatedAt: now,
  });
});
after(async () => { await db?.client.close(); await mongo?.stop(); });

// ---------------------------------------------------------------- signature

test("signatures follow PayMongo's t/te/li format and reject tampering", () => {
  const body = JSON.stringify({ data: { id: "evt_1", attributes: { type: "x", livemode: false } } });
  const header = signPaymongoEvent(body, "whsk_secret", 1_700_000_000);
  assert.match(header, /^t=1700000000,te=[0-9a-f]{64},li=$/);
  assert.equal(header.split(",")[1], `te=${createHmac("sha256", "whsk_secret").update(`1700000000.${body}`).digest("hex")}`);
  assert.equal(verifyPaymongoSignature(body, header, "whsk_secret"), true);
  assert.equal(verifyPaymongoSignature(body.replace("evt_1", "evt_2"), header, "whsk_secret"), false);
  assert.equal(verifyPaymongoSignature(body, header, "other_secret"), false);
  assert.equal(verifyPaymongoSignature(body, header.replace("t=1700000000", "t=1700000001"), "whsk_secret"), false);
  const te = header.split(",")[1];
  for (const malformed of [null, undefined, "", "garbage", "t=abc,te=00,li=", "t=1700000000", `t=1700000000,li=`, "t=1700000000,te=nothex,li=", `te=${te.slice(3)}`, `t=1700000000,te=${te.slice(3, 20)},li=`]) {
    assert.equal(verifyPaymongoSignature(body, malformed, "whsk_secret"), false, String(malformed));
  }
  // Live-mode events are checked against `li`, and a test signature in `te` must not satisfy them.
  const live = JSON.stringify({ data: { id: "evt_1", attributes: { type: "x", livemode: true } } });
  assert.equal(verifyPaymongoSignature(live, signPaymongoEvent(live, "whsk_secret"), "whsk_secret"), false);
});

test("the webhook secret is configurable and otherwise derived from AUTH_SECRET", () => {
  const derived = getPaymongoWebhookSecret();
  assert.equal(derived, getPaymongoWebhookSecret());
  assert.equal(derived, createHmac("sha256", process.env.AUTH_SECRET!).update("paymongo-simulated-webhook").digest("hex"));
  process.env.PAYMONGO_WEBHOOK_SECRET = "whsk_configured";
  try { assert.equal(getPaymongoWebhookSecret(), "whsk_configured"); } finally { delete process.env.PAYMONGO_WEBHOOK_SECRET; }
});

// ---------------------------------------------------------------- checkout creation

test("checkout creation validates the invoice, amount and return path", async () => {
  const invoiceId = await issuedInvoice(100000);
  await assert.rejects(createCheckout(db, other, { invoiceId }), isError(404));
  for (const actor of [clerk, admin]) await assert.rejects(createCheckout(db, actor, { invoiceId }), isError(403));
  await assert.rejects(createCheckout(db, customer, { invoiceId: new ObjectId().toHexString() }), isError(404));

  const draftId = await createInvoice(db, clerk, {
    projectId: projectId.toHexString(), label: "Draft stage", basis: "Signed milestone 2 and approved report", progressPercentage: 10, amount: 50000, dueDate: "2099-12-31",
  });
  await assert.rejects(createCheckout(db, customer, { invoiceId: draftId }), isError(409));

  await assert.rejects(createCheckout(db, customer, { invoiceId, amount: 19.99 }), isError(400));
  await assert.rejects(createCheckout(db, customer, { invoiceId, amount: 100000.01 }), isError(400));
  await assert.rejects(createCheckout(db, customer, { invoiceId, amount: 50.005 }), /decimal/);
  await assert.rejects(createCheckout(db, customer, { invoiceId, amount: -5 }));
  for (const returnPath of ["/admin/projects", "https://evil.example/customer/x", "/customer//evil.example", "/customer/\\evil", "customer/billing", "/customer/../admin"]) {
    await assert.rejects(createCheckout(db, customer, { invoiceId, returnPath }), (error: unknown) => error instanceof Error, returnPath);
  }
  assert.equal(await db.collection("payment_checkouts").countDocuments(), 0);

  const checkout = await createCheckout(db, customer, { invoiceId });
  assert.match(checkout.sessionId, /^cs_sim_[0-9a-f]{48}$/);
  assert.equal(checkout.status, "open");
  assert.equal(checkout.amount, 100000);
  assert.equal(checkout.returnPath, "/customer/billing");
  assert.equal(checkout.checkoutUrl, `/customer/checkout/${checkout.sessionId}`);
  assert.equal(checkout.livemode, false);
  assert.match(checkout.description, /^INV-\d{4}-\d{6} · Foundation work/);
  assert.ok(Math.abs(new Date(checkout.expiresAt).getTime() - Date.now() - 86_400_000) < 60_000);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "paymongo.checkout-created" }), 1);

  const partial = await createCheckout(db, customer, { invoiceId, amount: 20, returnPath: "/customer/billing?tab=open" });
  assert.equal(partial.amount, 20);
  assert.equal(partial.returnPath, "/customer/billing?tab=open");
});

test("checkout sessions are visible only to their customer and the billing clerk", async () => {
  const checkout = await checkoutFor(await issuedInvoice());
  assert.equal((await getCheckout(db, customer, checkout.sessionId)).sessionId, checkout.sessionId);
  assert.equal((await getCheckout(db, clerk, checkout.sessionId)).invoiceNumber, checkout.invoiceNumber);
  await assert.rejects(getCheckout(db, other, checkout.sessionId), isError(404));
  await assert.rejects(getCheckout(db, admin, checkout.sessionId), isError(403));
  await assert.rejects(getCheckout(db, customer, "cs_sim_missing"), isError(404));
  await assert.rejects(simulateCheckout(db, other, checkout.sessionId, { action: "cancel" }), isError(404));
  await assert.rejects(simulateCheckout(db, clerk, checkout.sessionId, { action: "pay", method: "gcash" }), isError(403));
  assert.equal((await storedCheckout(checkout.sessionId))?.status, "open");
});

test("online payments can be switched off", async () => {
  const invoiceId = await issuedInvoice();
  const checkout = await checkoutFor(invoiceId);
  process.env.PAYMONGO_SIMULATOR = "off";
  await assert.rejects(createCheckout(db, customer, { invoiceId }), isError(503));
  await assert.rejects(simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method: "gcash" }), isError(503));
});

// ---------------------------------------------------------------- paying

test("paying a checkout records a Verified payment with a receipt and settles the invoice", async () => {
  const invoiceId = await issuedInvoice(100000);
  const checkout = await checkoutFor(invoiceId);
  const result = await simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method: "gcash" });
  assert.equal(result.status, "paid");
  assert.equal(result.method, "gcash");
  assert.match(result.paymentId ?? "", /^pay_sim_/);
  assert.equal(result.heldForReview, false);

  const payments = await paymentsFor(invoiceId);
  assert.equal(payments.length, 1);
  const [payment] = payments;
  assert.equal(payment.status, "Verified");
  assert.equal(payment.method, "E-wallet");
  assert.equal(payment.amount, 100000);
  assert.equal(payment.transactionReference, result.paymentId);
  assert.equal(payment.gateway, "paymongo");
  assert.equal(payment.gatewayMethod, "gcash");
  assert.equal(payment.gatewaySessionId, checkout.sessionId);
  assert.equal(payment.gatewayLivemode, false);
  assert.equal(payment.reviewedByName, "PayMongo (automatic)");
  assert.equal(payment._id.toHexString(), result.billingPaymentId);
  assert.match(payment.receipt?.number ?? "", /^RCT-\d{4}-\d{6}$/);
  assert.equal(payment.receipt?.balanceAfterPayment, 0);
  assert.equal(payment.receipt?.verifiedByName, "PayMongo (automatic)");

  const invoice = await db.collection<InvoiceDocument>("invoices").findOne({ _id: new ObjectId(invoiceId) });
  assert.equal(invoice?.status, "Paid");
  const stored = await storedCheckout(checkout.sessionId);
  assert.equal(stored?.status, "paid");
  assert.equal(stored?.processedEventIds.length, 1);
  assert.ok(stored?.completedAt);
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(customer.id), title: "Payment verified — receipt available" }), 1);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "paymongo.payment-paid" }), 1);

  const dto = (await getBillingData(db, customer)).payments[0];
  assert.deepEqual(dto.gateway, { provider: "paymongo", method: "gcash", sessionId: checkout.sessionId, livemode: false });
  assert.equal(dto.status, "Verified");
  assert.equal((await getBillingData(db, clerk)).payments[0].gateway?.method, "gcash");
  await assert.rejects(simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method: "gcash" }), isError(409));
});

test("method mapping: card, wallets and online banking", async () => {
  const expected: Record<PaymongoMethod, string> = { card: "Card", gcash: "E-wallet", paymaya: "E-wallet", grab_pay: "E-wallet", qrph: "E-wallet", dob: "Bank transfer" };
  const invoiceId = await issuedInvoice(400000);
  for (const [method, label] of Object.entries(expected) as [PaymongoMethod, string][]) {
    const checkout = await checkoutFor(invoiceId, { amount: 1000 });
    await simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method });
    const payment = await db.collection<PaymentDocument>("payments").findOne({ gatewaySessionId: checkout.sessionId });
    assert.equal(payment?.method, label);
    assert.equal(payment?.gatewayMethod, method);
  }
  assert.equal(await db.collection("payments").countDocuments({ invoiceId: new ObjectId(invoiceId), status: "Verified" }), 6);
  const invoice = await db.collection<InvoiceDocument>("invoices").findOne({ _id: new ObjectId(invoiceId) });
  assert.equal(invoice?.status, "Partially Paid");
});

test("a redelivered webhook event is a no-op", async () => {
  const invoiceId = await issuedInvoice(100000);
  const checkout = await checkoutFor(invoiceId, { amount: 40000 });
  const body = paidBody(checkout.sessionId, 40000);
  assert.deepEqual(await deliver(body), { received: true });
  assert.deepEqual(await deliver(body), { received: true });
  await Promise.all([deliver(body), deliver(body)]);
  assert.equal((await paymentsFor(invoiceId)).length, 1);
  assert.equal(await db.collection("notifications").countDocuments({ title: "Payment verified — receipt available" }), 1);
  assert.equal((await storedCheckout(checkout.sessionId))?.processedEventIds.length, 1);
  // A new event id for an already-paid checkout is also ignored.
  await deliver(paidBody(checkout.sessionId, 40000));
  assert.equal((await paymentsFor(invoiceId)).length, 1);
});

test("the same gateway payment id delivered under a new event id is recorded once", async () => {
  const invoiceId = await issuedInvoice(100000);
  const first = await checkoutFor(invoiceId, { amount: 1000 });
  const second = await checkoutFor(invoiceId, { amount: 1000 });
  const paymentId = "pay_test_same_payment";
  await deliver(paidBody(first.sessionId, 1000, { paymentId }));
  await deliver(paidBody(second.sessionId, 1000, { paymentId }));
  assert.equal((await paymentsFor(invoiceId)).length, 1);
});

test("webhooks with a bad signature are rejected and change nothing", async () => {
  const invoiceId = await issuedInvoice();
  const checkout = await checkoutFor(invoiceId);
  const body = paidBody(checkout.sessionId, 100000);
  await assert.rejects(handlePaymongoWebhook(db, body, null), isError(401));
  await assert.rejects(handlePaymongoWebhook(db, body, "t=1,te=abc,li="), isError(401));
  await assert.rejects(handlePaymongoWebhook(db, body, signPaymongoEvent(body, "wrong-secret")), isError(401));
  await assert.rejects(handlePaymongoWebhook(db, body.replace("100000", "100"), signPaymongoEvent(body, secret())), isError(401));
  assert.equal((await paymentsFor(invoiceId)).length, 0);
  assert.equal((await storedCheckout(checkout.sessionId))?.status, "open");
});

test("signed events with unknown types, unknown sessions or a mismatched amount are handled safely", async () => {
  const invoiceId = await issuedInvoice();
  const checkout = await checkoutFor(invoiceId);
  const unknownType = JSON.stringify({ data: { id: "evt_x", type: "event", attributes: { type: "source.chargeable", livemode: false, data: {} } } });
  assert.deepEqual(await deliver(unknownType), { received: true });
  assert.deepEqual(await deliver(paidBody("cs_sim_unknown", 100000)), { received: true });
  await assert.rejects(deliver(paidBody(checkout.sessionId, 99999)), isError(400));
  await assert.rejects(deliver(paidBody(checkout.sessionId, 100000, { status: "pending" })), isError(400));
  await assert.rejects(deliver("{not json"), isError(400));
  // A test-mode signature cannot authenticate a live-mode event.
  await assert.rejects(deliver(paidBody(checkout.sessionId, 100000, { livemode: true })), isError(401));
  assert.equal((await paymentsFor(invoiceId)).length, 0);
  assert.equal((await storedCheckout(checkout.sessionId))?.status, "open");
});

test("a failed payment marks the checkout failed, creates no payment and notifies the customer", async () => {
  const invoiceId = await issuedInvoice();
  const checkout = await checkoutFor(invoiceId);
  const result = await simulateCheckout(db, customer, checkout.sessionId, { action: "fail", method: "card" });
  assert.equal(result.status, "failed");
  assert.equal(result.method, "card");
  assert.equal(result.failureReason, "The test payment was declined.");
  assert.equal(result.paymentId, null);
  assert.equal((await paymentsFor(invoiceId)).length, 0);
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(customer.id), title: "Online payment failed" }), 1);
  assert.equal((await db.collection<InvoiceDocument>("invoices").findOne({ _id: new ObjectId(invoiceId) }))?.status, "Sent");
  await assert.rejects(simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method: "card" }), isError(409));
  // The customer can start over with a new session.
  const retry = await checkoutFor(invoiceId);
  assert.equal((await simulateCheckout(db, customer, retry.sessionId, { action: "pay", method: "card" })).status, "paid");
});

test("a cancelled checkout cannot be paid", async () => {
  const invoiceId = await issuedInvoice();
  const checkout = await checkoutFor(invoiceId);
  assert.equal((await simulateCheckout(db, customer, checkout.sessionId, { action: "cancel" })).status, "cancelled");
  await assert.rejects(simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method: "gcash" }), isError(409));
  await assert.rejects(simulateCheckout(db, customer, checkout.sessionId, { action: "cancel" }), isError(409));
  assert.equal((await paymentsFor(invoiceId)).length, 0);
  assert.equal((await getCheckout(db, customer, checkout.sessionId)).status, "cancelled");
});

test("an expired checkout cannot be paid", async () => {
  const invoiceId = await issuedInvoice();
  const checkout = await checkoutFor(invoiceId);
  await db.collection("payment_checkouts").updateOne({ sessionId: checkout.sessionId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method: "gcash" }), isError(409));
  assert.equal((await getCheckout(db, customer, checkout.sessionId)).status, "expired");
  assert.equal((await storedCheckout(checkout.sessionId))?.status, "expired");
  assert.equal((await paymentsFor(invoiceId)).length, 0);
});

test("invalid simulator actions are rejected", async () => {
  const checkout = await checkoutFor(await issuedInvoice());
  for (const body of [{}, { action: "refund" }, { action: "pay" }, { action: "pay", method: "bitcoin" }, { action: "cancel", method: "gcash" }]) {
    await assert.rejects(simulateCheckout(db, customer, checkout.sessionId, body));
  }
  assert.equal((await storedCheckout(checkout.sessionId))?.status, "open");
});

test("two checkouts for the full balance: the second payment is held for review", async () => {
  const invoiceId = await issuedInvoice(100000);
  const first = await checkoutFor(invoiceId);
  const second = await checkoutFor(invoiceId);
  assert.equal((await simulateCheckout(db, customer, first.sessionId, { action: "pay", method: "gcash" })).heldForReview, false);
  const held = await simulateCheckout(db, customer, second.sessionId, { action: "pay", method: "paymaya" });
  assert.equal(held.status, "paid");
  assert.equal(held.heldForReview, true);

  const payments = await paymentsFor(invoiceId);
  assert.deepEqual(payments.map((payment) => payment.status).sort(), ["Pending", "Verified"]);
  const pending = payments.find((payment) => payment.status === "Pending")!;
  assert.equal(pending.receipt, undefined);
  assert.equal(pending._id.toHexString(), held.billingPaymentId);
  assert.equal((await db.collection<InvoiceDocument>("invoices").findOne({ _id: new ObjectId(invoiceId) }))?.status, "Paid");
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(clerk.id), title: "Online payment needs review" }), 1);
  assert.equal((await getBillingData(db, clerk)).payments.find((payment) => payment.id === pending._id.toHexString())?.gateway?.method, "paymaya");
  // The clerk cannot verify it because it exceeds the balance, but can reject it.
  await assert.rejects(reviewPayment(db, clerk, pending._id.toHexString(), { action: "verify" }), isError(409));
  await reviewPayment(db, clerk, pending._id.toHexString(), { action: "reject", reason: "Duplicate online payment, refund the customer" });
  assert.equal((await db.collection<PaymentDocument>("payments").findOne({ _id: pending._id }))?.status, "Rejected");
});

test("a payment for a voided invoice is held, not applied", async () => {
  const invoiceId = await issuedInvoice(100000);
  const checkout = await checkoutFor(invoiceId);
  await changeInvoice(db, clerk, invoiceId, { action: "void", reason: "Issued against the wrong stage" });
  const result = await simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method: "gcash" });
  assert.equal(result.heldForReview, true);
  const [payment] = await paymentsFor(invoiceId);
  assert.equal(payment.status, "Pending");
  assert.equal((await db.collection<InvoiceDocument>("invoices").findOne({ _id: new ObjectId(invoiceId) }))?.status, "Void");
});

test("paying a construction downpayment moves the project from awaiting downpayment to scheduled", async () => {
  const id = await acceptedProject();
  const before = await projectDto(id);
  assert.equal(before.status, "Awaiting downpayment");
  const milestone = before.milestones[0];
  const invoiceId = milestone.invoice?.id ?? await createInvoice(db, clerk, {
    projectId: id, milestoneId: milestone.id, label: milestone.label, basis: "Downpayment per accepted estimate",
    progressPercentage: milestone.percentage, amount: milestone.amount, dueDate: "2099-12-31",
  });
  await changeInvoice(db, clerk, invoiceId, { action: "issue" });
  const checkout = await checkoutFor(invoiceId);
  assert.equal(checkout.amount, milestone.amount);
  assert.equal((await simulateCheckout(db, customer, checkout.sessionId, { action: "pay", method: "dob" })).status, "paid");
  const after = await projectDto(id);
  assert.equal(after.status, "Scheduled");
  assert.equal(after.milestones[0].status, "Paid");
  assert.equal((await paymentsFor(invoiceId))[0].method, "Bank transfer");
  assert.equal(await db.collection("notifications").countDocuments({ userId: new ObjectId(customer.id), title: /Downpayment verified/ }), 1);
});

test("paying a design fee through PayMongo unlocks the design", async () => {
  const { designId, invoiceId } = await unpaidDesignFee();
  assert.equal((await listCustomerDesigns(db, customer)).find((item) => item.id === designId)?.access, "payment-required");
  const partial = await checkoutFor(invoiceId, { amount: 2000 });
  await simulateCheckout(db, customer, partial.sessionId, { action: "pay", method: "card" });
  assert.equal((await listCustomerDesigns(db, customer)).find((item) => item.id === designId)?.access, "payment-required");
  const rest = await checkoutFor(invoiceId);
  assert.equal(rest.amount, 3000);
  await simulateCheckout(db, customer, rest.sessionId, { action: "pay", method: "card" });
  assert.equal((await listCustomerDesigns(db, customer)).find((item) => item.id === designId)?.access, "unlocked");
  assert.equal(await db.collection("notifications").countDocuments({ kind: "design-access", title: "Your house design is unlocked" }), 1);
});
