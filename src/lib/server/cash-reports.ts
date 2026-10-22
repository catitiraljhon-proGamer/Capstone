import { ObjectId, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import { collections, type CashReportDocument, type InvoiceDocument, type PaymentDocument, type UserDocument } from "@/lib/database/collections";
import { fromCentavos, manilaDate, sumMoney, toCentavos } from "@/lib/billing";
import { formatPeso } from "@/lib/house-design-data";
import { BillingError, audit, billingTransaction, nextReference } from "@/lib/server/billing";
import { insertNotifications } from "@/lib/server/notifications";
import type { CashDrawer, CashReport, CashReportPayment } from "@/types/billing";
import type { SessionUser } from "@/types/domain";

const idSchema = z.string().regex(/^[a-f\d]{24}$/i, "Select a valid record.");
const cashSchema = z.number().finite().min(0).max(1_000_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, "Use at most two decimal places.");

/** The clerk sends back the cash and expected total they counted against, so cash recorded meanwhile is never counted blind. */
export const cashReportInputSchema = z.object({
  paymentIds: z.array(idSchema).min(1).max(1000),
  expected: cashSchema,
  counted: cashSchema,
  explanation: z.string().trim().max(1000).optional(),
}).strict();

export const cashReportVerifySchema = z.object({
  received: z.literal(true, { error: "Confirm that you received and counted the cash." }),
  note: z.string().trim().max(1000).optional(),
}).strict();

function assertClerk(actor: SessionUser) {
  if (actor.role !== "billing-clerk") throw new BillingError("Only the Billing Clerk counts the cash they recorded.", 403);
}

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new BillingError("Only the Admin verifies daily cash reports.", 403);
}

/** Cash recorded by this clerk that no report has counted yet. Cash is verified by the clerk who records it. */
const uncountedBy = (clerkId: ObjectId) => ({ uncountedCash: true as const, verifiedBy: clerkId });

const expectedCash = (payments: Pick<PaymentDocument, "amount" | "status">[]) =>
  sumMoney(payments.filter((payment) => payment.status === "Verified").map((payment) => payment.amount));

async function cashPaymentDtos(db: Db, payments: PaymentDocument[], session?: ClientSession): Promise<CashReportPayment[]> {
  const unique = (ids: ObjectId[]) => [...new Set(ids.map((id) => id.toHexString()))].map((id) => new ObjectId(id));
  const [customers, invoices] = await Promise.all([
    db.collection<UserDocument>(collections.users).find({ _id: { $in: unique(payments.map((payment) => payment.customerId)) } }, { session, projection: { name: 1 } }).toArray(),
    db.collection<InvoiceDocument>(collections.invoices).find({ _id: { $in: unique(payments.flatMap((payment) => payment.invoiceId ? [payment.invoiceId] : [])) } }, { session, projection: { invoiceNumber: 1 } }).toArray(),
  ]);
  const customerNames = new Map(customers.map((customer) => [customer._id.toHexString(), customer.name]));
  const invoiceNumbers = new Map(invoices.map((invoice) => [invoice._id.toHexString(), invoice.invoiceNumber]));
  const recorded = (a: PaymentDocument, b: PaymentDocument) => a.createdAt.getTime() - b.createdAt.getTime() || a._id.toHexString().localeCompare(b._id.toHexString());
  return [...payments].sort(recorded).map((payment) => ({
    id: payment._id.toHexString(), reference: payment.reference, receiptNumber: payment.receipt?.number,
    customerName: customerNames.get(payment.customerId.toHexString()) ?? "Unknown customer",
    invoiceNumber: payment.invoiceId ? invoiceNumbers.get(payment.invoiceId.toHexString()) ?? "Unavailable invoice" : "Unallocated",
    amount: payment.amount, status: payment.status === "Reversed" ? "Reversed" : "Verified",
    paidAt: payment.paidAt.toISOString(), reversalReason: payment.reversalReason,
  }));
}

async function reportDtos(db: Db, reports: CashReportDocument[]): Promise<CashReport[]> {
  const payments = await db.collection<PaymentDocument>(collections.payments)
    .find({ _id: { $in: reports.flatMap((report) => report.paymentIds) } }, { projection: { proofImage: 0 } }).toArray();
  const listed = new Map((await cashPaymentDtos(db, payments)).map((payment) => [payment.id, payment]));
  return reports.map((report) => ({
    id: report._id.toHexString(), reference: report.reference, clerkName: report.clerkName, businessDate: report.businessDate,
    expected: report.expected, counted: report.counted, difference: fromCentavos(toCentavos(report.counted) - toCentavos(report.expected)),
    explanation: report.explanation, status: report.status, submittedAt: report.submittedAt.toISOString(),
    verifiedAt: report.verifiedAt?.toISOString(), verifiedByName: report.verifiedByName, adminNote: report.adminNote,
    payments: report.paymentIds.flatMap((id) => listed.get(id.toHexString()) ?? []),
  }));
}

/** The Billing Clerk's uncounted cash and their recent daily cash reports, shown on the Payments page. */
export async function getClerkCashSummary(db: Db, actor: SessionUser): Promise<{ cashDrawer: CashDrawer; cashReports: CashReport[] }> {
  assertClerk(actor);
  const clerkId = new ObjectId(actor.id);
  const [uncounted, reports] = await Promise.all([
    db.collection<PaymentDocument>(collections.payments).find(uncountedBy(clerkId), { projection: { proofImage: 0 } }).toArray(),
    db.collection<CashReportDocument>(collections.cashReports).find({ clerkId }).sort({ submittedAt: -1 }).limit(10).toArray(),
  ]);
  return {
    cashDrawer: { payments: await cashPaymentDtos(db, uncounted), expected: expectedCash(uncounted) },
    cashReports: await reportDtos(db, reports),
  };
}

/** Daily cash reports for the Admin: those waiting for verification first, then the most recent verified ones. */
export async function listCashReports(db: Db, actor: SessionUser) {
  assertAdmin(actor);
  const reports = await db.collection<CashReportDocument>(collections.cashReports)
    .find({}).sort({ status: 1, submittedAt: -1 }).limit(50).toArray();
  return reportDtos(db, reports);
}

/**
 * Counts the clerk's uncounted cash into a daily cash report for the Admin. The counted total cannot be changed
 * afterwards; a difference from the expected cash must be explained.
 */
export async function submitCashReport(db: Db, actor: SessionUser, raw: unknown) {
  assertClerk(actor);
  const input = cashReportInputSchema.parse(raw);
  const clerkId = new ObjectId(actor.id);
  return billingTransaction(db, async (session) => {
    const paymentCollection = db.collection<PaymentDocument>(collections.payments);
    const payments = await paymentCollection.find(uncountedBy(clerkId), { session, projection: { proofImage: 0 } }).toArray();
    if (!payments.length) throw new BillingError("There is no uncounted cash to report.", 409);
    const expected = expectedCash(payments);
    const ids = new Set(payments.map((payment) => payment._id.toHexString()));
    if (ids.size !== new Set(input.paymentIds).size || input.paymentIds.some((id) => !ids.has(id)) || toCentavos(expected) !== toCentavos(input.expected)) {
      throw new BillingError("Cash was recorded or voided after you opened this. Close it and enter the cash total again.", 409);
    }
    const balanced = toCentavos(input.counted) === toCentavos(expected);
    if (!balanced && (input.explanation?.length ?? 0) < 5) throw new BillingError("Explain the difference between the counted and expected cash.");
    const now = new Date();
    const report: CashReportDocument = {
      _id: new ObjectId(), reference: await nextReference(db, session, "DCR", now), clerkId, clerkName: actor.name,
      businessDate: manilaDate(now), paymentIds: payments.map((payment) => payment._id), expected, counted: input.counted,
      ...(balanced ? {} : { explanation: input.explanation }), status: "Pending", submittedAt: now,
    };
    await db.collection<CashReportDocument>(collections.cashReports).insertOne(report, { session });
    const counted = await paymentCollection.updateMany(
      { _id: { $in: report.paymentIds }, uncountedCash: true },
      { $unset: { uncountedCash: "" }, $set: { cashReportId: report._id } }, { session },
    );
    if (counted.modifiedCount !== report.paymentIds.length) throw new BillingError("This cash was already counted. Refresh and try again.", 409);
    await audit(db, session, actor, "cash-report.submitted", "cash-report", report._id, { reference: report.reference, expected, counted: input.counted });
    const admins = await db.collection<UserDocument>(collections.users).find({ role: "admin", status: "active" }, { session, projection: { _id: 1 } }).toArray();
    await insertNotifications(db, admins.map((admin) => ({
      _id: new ObjectId(), userId: admin._id, title: "Daily cash report to verify",
      body: `${report.reference}: ${actor.name} counted ${formatPeso(input.counted)} in cash (expected ${formatPeso(expected)}). Verify it when the cash is handed over.`,
      href: "/admin/approvals", kind: "cash-report", entityId: report._id, createdAt: now,
    })), session);
    return report._id.toHexString();
  });
}

/** The Admin confirms receiving and counting the reported cash, which closes the report. */
export async function verifyCashReport(db: Db, actor: SessionUser, id: string, raw: unknown) {
  assertAdmin(actor);
  const input = cashReportVerifySchema.parse(raw);
  return billingTransaction(db, async (session) => {
    const reports = db.collection<CashReportDocument>(collections.cashReports);
    const report = await reports.findOne({ _id: new ObjectId(idSchema.parse(id)) }, { session });
    if (!report) throw new BillingError("Daily cash report not found.", 404);
    if (report.status !== "Pending") throw new BillingError("This daily cash report was already verified.", 409);
    if (toCentavos(report.counted) !== toCentavos(report.expected) && (input.note?.length ?? 0) < 5) {
      throw new BillingError("Add a note on the difference before verifying.");
    }
    const now = new Date();
    const verified = await reports.updateOne({ _id: report._id, status: "Pending" }, { $set: {
      status: "Verified", verifiedAt: now, verifiedBy: new ObjectId(actor.id), verifiedByName: actor.name, ...(input.note ? { adminNote: input.note } : {}),
    } }, { session });
    if (!verified.modifiedCount) throw new BillingError("This daily cash report was already verified.", 409);
    await audit(db, session, actor, "cash-report.verified", "cash-report", report._id, { reference: report.reference, counted: report.counted, ...(input.note ? { note: input.note } : {}) });
    await insertNotifications(db, [{
      _id: new ObjectId(), userId: report.clerkId, title: "Daily cash report verified",
      body: `${report.reference}: ${actor.name} received and verified ${formatPeso(report.counted)} in cash.`,
      href: "/billing-clerk/payments", kind: "cash-report", entityId: report._id, createdAt: now,
    }], session);
  });
}
