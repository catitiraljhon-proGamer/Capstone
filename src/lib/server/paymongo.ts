import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ObjectId, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import { collections, type InvoiceDocument, type NotificationDocument, type PaymentCheckoutDocument, type PaymentDocument, type UserDocument } from "@/lib/database/collections";
import { fromCentavos, invoiceState, sumMoney, toCentavos } from "@/lib/billing";
import { assertBillingRole, audit, BillingError, billingTransaction, lockInvoice, nextReference, verifyPaymentInSession } from "@/lib/server/billing";
import { getAuthSecret } from "@/lib/server/auth-secret";
import { PAYMONGO_MIN_AMOUNT, paymongoMethodLabels, paymongoMethods, type PaymongoCheckoutDto, type PaymongoMethod } from "@/types/paymongo";
import type { PaymentMethod } from "@/types/billing";
import type { SessionUser } from "@/types/domain";

const CHECKOUT_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SIMULATED_ACTOR = { name: "PayMongo (automatic)", role: "customer" } as const;
const methodMap: Record<PaymongoMethod, PaymentMethod> = {
  card: "Card", gcash: "E-wallet", paymaya: "E-wallet", grab_pay: "E-wallet", qrph: "E-wallet", dob: "Bank transfer",
};

const idSchema = z.string().regex(/^[a-f\d]{24}$/i, "Select a valid record.");
const checkoutInputSchema = z.object({
  invoiceId: idSchema,
  amount: z.number().finite().positive().max(1_000_000_000)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, "Use at most two decimal places.").optional(),
  returnPath: z.string().max(200).refine(
    (value) => value.startsWith("/customer/") && !value.includes("//") && !value.includes("\\") && !value.includes("..") && !/[\s\u0000-\u001f]/.test(value),
    "Return to a page inside the customer area.",
  ).optional(),
}).strict();
const simulatorActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pay"), method: z.enum(paymongoMethods) }).strict(),
  z.object({ action: z.literal("fail"), method: z.enum(paymongoMethods) }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
]);

// ---------------------------------------------------------------- signature

/** The shared webhook secret. Use PayMongo's own webhook secret when configured, otherwise a stable one derived from AUTH_SECRET. */
export function getPaymongoWebhookSecret() {
  const configured = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (configured) return configured;
  return createHmac("sha256", Buffer.from(getAuthSecret())).update("paymongo-simulated-webhook").digest("hex");
}

const hmacHex = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("hex");

/** Builds a `Paymongo-Signature` header: `t=<unix seconds>,te=<test signature>,li=<live signature>`. Simulated events are test-mode, so `li` is empty. */
export function signPaymongoEvent(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},te=${hmacHex(secret, `${timestamp}.${rawBody}`)},li=`;
}

/** Checks a `Paymongo-Signature` header against the raw request body. Test events are checked against `te`, live events against `li`. */
export function verifyPaymongoSignature(rawBody: string, header: string | null | undefined, secret: string) {
  if (!header || header.length > 400) return false;
  const parts = new Map<string, string>();
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index > 0) parts.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  const timestamp = parts.get("t");
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  let livemode = false;
  try { livemode = (JSON.parse(rawBody) as { data?: { attributes?: { livemode?: unknown } } }).data?.attributes?.livemode === true; } catch { /* not JSON: checked as a test event, then rejected as invalid data */ }
  const provided = parts.get(livemode ? "li" : "te");
  if (!provided || !/^[0-9a-f]{64}$/i.test(provided)) return false;
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(hmacHex(secret, `${timestamp}.${rawBody}`), "hex"));
}

// ---------------------------------------------------------------- checkout

async function verifiedTotal(db: Db, invoiceId: ObjectId, session?: ClientSession) {
  const payments = await db.collection<PaymentDocument>(collections.payments)
    .find({ invoiceId, status: "Verified" }, { session, projection: { amount: 1 } }).toArray();
  return sumMoney(payments.map((payment) => payment.amount));
}

function simulatorEnabled() {
  if (process.env.PAYMONGO_SIMULATOR === "off") throw new BillingError("Online payments are not available.", 503);
}

function assertCustomer(actor: SessionUser) {
  if (actor.role !== "customer") throw new BillingError("Only customers can pay invoices online.", 403);
}

function toDto(checkout: PaymentCheckoutDocument, invoice: InvoiceDocument | null): PaymongoCheckoutDto {
  return {
    sessionId: checkout.sessionId, status: checkout.status, invoiceId: checkout.invoiceId.toHexString(),
    invoiceNumber: invoice?.invoiceNumber ?? "Unavailable invoice", invoiceLabel: invoice?.label ?? "",
    description: checkout.description, amount: checkout.amount, checkoutUrl: `/customer/checkout/${checkout.sessionId}`,
    returnPath: checkout.returnPath, method: checkout.method ?? null, paymentId: checkout.paymentId ?? null,
    billingPaymentId: checkout.billingPaymentId?.toHexString() ?? null, heldForReview: checkout.heldForReview ?? false,
    failureReason: checkout.failureReason ?? null, livemode: false,
    expiresAt: checkout.expiresAt.toISOString(), createdAt: checkout.createdAt.toISOString(),
  };
}

export async function createCheckout(db: Db, actor: SessionUser, raw: unknown): Promise<PaymongoCheckoutDto> {
  assertBillingRole(actor, true);
  assertCustomer(actor);
  simulatorEnabled();
  const input = checkoutInputSchema.parse(raw);
  const invoice = await db.collection<InvoiceDocument>(collections.invoices).findOne({ _id: new ObjectId(input.invoiceId), customerId: new ObjectId(actor.id) });
  if (!invoice) throw new BillingError("Invoice not found.", 404);
  if (["Draft", "Ready", "Void"].includes(invoice.status)) throw new BillingError("Only issued invoices can be paid online.", 409);
  const paid = await verifiedTotal(db, invoice._id);
  const { balance } = invoiceState(invoice, paid);
  if (balance <= 0) throw new BillingError("This invoice has no remaining balance.", 409);
  const amount = input.amount ?? balance;
  if (toCentavos(amount) < toCentavos(PAYMONGO_MIN_AMOUNT)) throw new BillingError(`The minimum online payment is PHP ${PAYMONGO_MIN_AMOUNT.toFixed(2)}.`);
  if (toCentavos(amount) > toCentavos(balance)) throw new BillingError("The amount exceeds this invoice's outstanding balance.");
  const now = new Date();
  const checkout: PaymentCheckoutDocument = {
    _id: new ObjectId(), sessionId: `cs_sim_${randomBytes(24).toString("hex")}`, customerId: invoice.customerId, invoiceId: invoice._id,
    amount, description: `${invoice.invoiceNumber} · ${invoice.label}`, returnPath: input.returnPath ?? "/customer/billing",
    status: "open", processedEventIds: [], livemode: false, expiresAt: new Date(now.getTime() + CHECKOUT_LIFETIME_MS), createdAt: now, updatedAt: now,
  };
  await billingTransaction(db, async (session) => {
    await db.collection<PaymentCheckoutDocument>(collections.paymentCheckouts).insertOne(checkout, { session });
    await audit(db, session, actor, "paymongo.checkout-created", "payment-checkout", checkout._id, {
      sessionId: checkout.sessionId, invoiceNumber: invoice.invoiceNumber, amount,
    });
  });
  return toDto(checkout, invoice);
}

async function loadCheckout(db: Db, actor: SessionUser, sessionId: string) {
  assertBillingRole(actor, true);
  if (!/^cs_sim_[a-f\d]{48}$/.test(sessionId)) throw new BillingError("Checkout session not found.", 404);
  const checkouts = db.collection<PaymentCheckoutDocument>(collections.paymentCheckouts);
  await checkouts.updateOne({ sessionId, status: "open", expiresAt: { $lte: new Date() } }, { $set: { status: "expired", updatedAt: new Date() } });
  const checkout = await checkouts.findOne({ sessionId, ...(actor.role === "customer" ? { customerId: new ObjectId(actor.id) } : {}) });
  if (!checkout) throw new BillingError("Checkout session not found.", 404);
  return checkout;
}

async function checkoutDto(db: Db, checkout: PaymentCheckoutDocument) {
  return toDto(checkout, await db.collection<InvoiceDocument>(collections.invoices).findOne({ _id: checkout.invoiceId }));
}

export async function getCheckout(db: Db, actor: SessionUser, sessionId: string): Promise<PaymongoCheckoutDto> {
  return checkoutDto(db, await loadCheckout(db, actor, sessionId));
}

// ---------------------------------------------------------------- simulator

function paidEvent(checkout: PaymentCheckoutDocument, invoice: InvoiceDocument, method: PaymongoMethod, now: Date) {
  const seconds = Math.floor(now.getTime() / 1000);
  return {
    data: {
      id: `evt_sim_${randomBytes(12).toString("hex")}`, type: "event",
      attributes: {
        type: "checkout_session.payment.paid", livemode: false, created_at: seconds, updated_at: seconds, previous_data: {}, pending_webhooks: 0,
        data: {
          id: checkout.sessionId, type: "checkout_session",
          attributes: {
            reference_number: invoice.invoiceNumber,
            metadata: { checkoutId: checkout._id.toHexString(), invoiceId: invoice._id.toHexString() },
            payments: [{
              id: `pay_sim_${randomBytes(12).toString("hex")}`, type: "payment",
              attributes: { amount: toCentavos(checkout.amount), currency: "PHP", status: "paid", paid_at: seconds, source: { type: method } },
            }],
            payment_method_used: method,
          },
        },
      },
    },
  };
}

function failedEvent(checkout: PaymentCheckoutDocument, invoice: InvoiceDocument, method: PaymongoMethod, now: Date) {
  const seconds = Math.floor(now.getTime() / 1000);
  return {
    data: {
      id: `evt_sim_${randomBytes(12).toString("hex")}`, type: "event",
      attributes: {
        type: "payment.failed", livemode: false, created_at: seconds, updated_at: seconds, previous_data: {}, pending_webhooks: 0,
        data: {
          id: `pay_sim_${randomBytes(12).toString("hex")}`, type: "payment",
          attributes: {
            amount: toCentavos(checkout.amount), currency: "PHP", status: "failed",
            last_payment_error: { failed_message: "The test payment was declined." },
            metadata: { checkoutSessionId: checkout.sessionId, invoiceId: invoice._id.toHexString() },
            source: { type: method },
          },
        },
      },
    },
  };
}

export async function simulateCheckout(db: Db, actor: SessionUser, sessionId: string, raw: unknown): Promise<PaymongoCheckoutDto> {
  assertCustomer(actor);
  simulatorEnabled();
  const input = simulatorActionSchema.parse(raw);
  const checkout = await loadCheckout(db, actor, sessionId);
  if (checkout.status === "expired") throw new BillingError("This checkout session has expired. Start a new payment from Billing.", 409);
  if (checkout.status !== "open") throw new BillingError("This checkout session is already complete.", 409);
  if (input.action === "cancel") {
    await db.collection<PaymentCheckoutDocument>(collections.paymentCheckouts).updateOne(
      { _id: checkout._id, status: "open" }, { $set: { status: "cancelled", completedAt: new Date(), updatedAt: new Date() } },
    );
  } else {
    const invoice = await db.collection<InvoiceDocument>(collections.invoices).findOne({ _id: checkout.invoiceId });
    if (!invoice) throw new BillingError("Invoice not found.", 404);
    const now = new Date();
    const rawBody = JSON.stringify((input.action === "pay" ? paidEvent : failedEvent)(checkout, invoice, input.method, now));
    await handlePaymongoWebhook(db, rawBody, signPaymongoEvent(rawBody, getPaymongoWebhookSecret()));
  }
  return checkoutDto(db, await loadCheckout(db, actor, sessionId));
}

// ---------------------------------------------------------------- webhook

const envelopeSchema = z.object({
  data: z.object({
    id: z.string().min(1).max(120),
    attributes: z.object({ type: z.string().max(120), livemode: z.boolean(), data: z.unknown() }),
  }),
});
const paidResourceSchema = z.object({
  id: z.string().min(1).max(120),
  attributes: z.object({
    payments: z.array(z.object({
      id: z.string().min(1).max(120),
      attributes: z.object({
        amount: z.number().int(), currency: z.string(), status: z.string(), paid_at: z.number().optional(),
        source: z.object({ type: z.string() }).optional(),
      }),
    })).min(1),
    payment_method_used: z.string().optional(),
  }),
});
const failedResourceSchema = z.object({
  id: z.string().min(1).max(120),
  attributes: z.object({
    amount: z.number().int(), currency: z.string(),
    last_payment_error: z.object({ failed_message: z.string().max(300).optional() }).optional(),
    metadata: z.object({ checkoutSessionId: z.string() }),
    source: z.object({ type: z.string() }).optional(),
  }),
});
const gatewayMethod = (value: string | undefined) => {
  const method = paymongoMethods.find((item) => item === value);
  if (!method) throw new BillingError("The payment method is not supported.", 400);
  return method;
};

export async function handlePaymongoWebhook(db: Db, rawBody: string, signatureHeader: string | null | undefined): Promise<{ received: true }> {
  if (!verifyPaymongoSignature(rawBody, signatureHeader, getPaymongoWebhookSecret())) throw new BillingError("Invalid webhook signature.", 401);
  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { throw new BillingError("Invalid event data.", 400); }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) throw new BillingError("Invalid event data.", 400);
  const eventId = envelope.data.data.id;
  const { type, livemode, data: resource } = envelope.data.data.attributes;
  if (type !== "checkout_session.payment.paid" && type !== "payment.failed") return { received: true };
  // This integration only issues test-mode checkouts, so live events are never ours.
  if (livemode) return { received: true };
  const checkouts = db.collection<PaymentCheckoutDocument>(collections.paymentCheckouts);
  if (type === "payment.failed") {
    const parsed = failedResourceSchema.safeParse(resource);
    if (!parsed.success) throw new BillingError("Invalid event data.", 400);
    return handleFailed(db, eventId, parsed.data.attributes.metadata.checkoutSessionId, parsed.data);
  }
  const parsed = paidResourceSchema.safeParse(resource);
  if (!parsed.success) throw new BillingError("Invalid event data.", 400);
  const payment = parsed.data.attributes.payments[0];
  const checkout = await checkouts.findOne({ sessionId: parsed.data.id });
  if (!checkout || checkout.processedEventIds.includes(eventId) || checkout.status === "paid") return { received: true };
  if (payment.attributes.status !== "paid") throw new BillingError("The payment is not marked as paid.", 400);
  if (payment.attributes.currency !== "PHP" || payment.attributes.amount !== toCentavos(checkout.amount)) {
    throw new BillingError("The payment amount does not match the checkout session.", 400);
  }
  const method = gatewayMethod(payment.attributes.source?.type ?? parsed.data.attributes.payment_method_used);
  await billingTransaction(db, async (session) => {
    const now = new Date();
    const claimed = await checkouts.findOneAndUpdate(
      { _id: checkout._id, processedEventIds: { $ne: eventId }, status: { $ne: "paid" } },
      { $push: { processedEventIds: eventId }, $set: { updatedAt: now } }, { session },
    );
    if (!claimed) return;
    const payments = db.collection<PaymentDocument>(collections.payments);
    const duplicateKey = `${methodMap[method]}:${payment.id.toLowerCase()}`;
    if (await payments.findOne({ duplicateKey }, { session, projection: { _id: 1 } })) return;
    const invoice = await lockInvoice(db, session, checkout.invoiceId);
    const amount = checkout.amount;
    const doc: PaymentDocument = {
      _id: new ObjectId(), reference: await nextReference(db, session, "PAY", now),
      customerId: invoice.customerId, projectId: invoice.projectId, invoiceId: invoice._id,
      amount, method: methodMap[method], status: "Pending",
      paidAt: payment.attributes.paid_at ? new Date(payment.attributes.paid_at * 1000) : now, createdAt: now,
      transactionReference: payment.id, duplicateKey, submissionKey: `paymongo:${payment.id}`,
      notes: "Paid online through PayMongo (test mode simulation)",
      gateway: "paymongo", gatewayMethod: method, gatewaySessionId: checkout.sessionId, gatewayLivemode: false,
    };
    await payments.insertOne(doc, { session });
    const paid = await verifiedTotal(db, invoice._id, session);
    const payable = !["Draft", "Ready", "Void"].includes(invoice.status) && toCentavos(amount) <= toCentavos(invoiceState(invoice, paid).balance);
    const notifications = db.collection<NotificationDocument>(collections.notifications);
    if (payable) {
      await verifyPaymentInSession(db, session, { payment: doc, invoice, verifier: { id: invoice.customerId.toHexString(), ...SIMULATED_ACTOR }, now });
    } else {
      const clerks = await db.collection<UserDocument>(collections.users).find({ role: "billing-clerk", status: "active" }, { session, projection: { _id: 1 } }).toArray();
      await notifications.insertMany([
        ...clerks.map((clerk) => ({
          _id: new ObjectId(), userId: clerk._id, title: "Online payment needs review",
          body: `${doc.reference} (${formatPhp(amount)}) was paid online for ${invoice.invoiceNumber} but could not be applied automatically. Review it in Payments.`,
          href: "/billing-clerk/payments", kind: "billing", entityId: doc._id, createdAt: now,
        })),
        {
          _id: new ObjectId(), userId: invoice.customerId, title: "Online payment received — under review",
          body: `${doc.reference} for ${invoice.invoiceNumber} was received and is being reviewed by the Billing Clerk.`,
          href: "/customer/billing", kind: "billing", entityId: doc._id, createdAt: now,
        },
      ], { session });
    }
    await checkouts.updateOne({ _id: checkout._id }, { $set: {
      status: "paid", method, paymentId: payment.id, billingPaymentId: doc._id, completedAt: now, updatedAt: now,
      ...(payable ? {} : { heldForReview: true }),
    } }, { session });
    await audit(db, session, { id: invoice.customerId.toHexString(), ...SIMULATED_ACTOR }, "paymongo.payment-paid", "payment", doc._id, {
      reference: doc.reference, amount, sessionId: checkout.sessionId, method, heldForReview: !payable,
    });
  });
  return { received: true };
}

async function handleFailed(db: Db, eventId: string, sessionId: string, resource: z.infer<typeof failedResourceSchema>) {
  const checkouts = db.collection<PaymentCheckoutDocument>(collections.paymentCheckouts);
  const checkout = await checkouts.findOne({ sessionId });
  if (!checkout || checkout.processedEventIds.includes(eventId) || checkout.status !== "open") return { received: true } as const;
  const method = gatewayMethod(resource.attributes.source?.type);
  await billingTransaction(db, async (session) => {
    const now = new Date();
    const failureReason = resource.attributes.last_payment_error?.failed_message ?? "The payment could not be completed.";
    const claimed = await checkouts.findOneAndUpdate(
      { _id: checkout._id, processedEventIds: { $ne: eventId }, status: "open" },
      { $push: { processedEventIds: eventId }, $set: { status: "failed", failureReason, method, completedAt: now, updatedAt: now } }, { session },
    );
    if (!claimed) return;
    const invoice = await db.collection<InvoiceDocument>(collections.invoices).findOne({ _id: checkout.invoiceId }, { session });
    await db.collection<NotificationDocument>(collections.notifications).insertOne({
      _id: new ObjectId(), userId: checkout.customerId, title: "Online payment failed",
      body: `${paymongoMethodLabels[method]} payment for ${invoice?.invoiceNumber ?? "your invoice"} did not go through: ${failureReason} You were not charged.`,
      href: "/customer/billing", kind: "billing", entityId: checkout._id, createdAt: now,
    }, { session });
    await audit(db, session, { id: checkout.customerId.toHexString(), ...SIMULATED_ACTOR }, "paymongo.payment-failed", "payment-checkout", checkout._id, {
      sessionId, method, reason: failureReason,
    });
  });
  return { received: true } as const;
}

function formatPhp(value: number) {
  return `PHP ${fromCentavos(toCentavos(value)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

