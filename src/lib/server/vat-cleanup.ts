import { type Db, ObjectId } from "mongodb";
import {
  collections, type EstimateDocument, type InvoiceDocument, type PaymentDocument, type ProjectDocument, type ScheduleDocument,
} from "@/lib/database/collections";
import { buildPaymentSchedule } from "@/lib/construction";
import { billingTransaction } from "@/lib/server/billing";

/**
 * G4 Builders is VAT-exempt, so estimates saved with VAT before that change drop it: the contract total becomes the
 * sum of the scope-of-work amounts. An accepted project is recomputed too unless billing already started on it (an
 * issued invoice or a payment), because the customer was already charged on that total.
 */
export async function removeVatFromEstimates(db: Db) {
  await db.collection<EstimateDocument>(collections.estimates).updateMany(
    { status: { $in: ["Requested", "Draft", "Sent", "Revision requested"] }, vat: { $exists: true } },
    [{ $set: { total: "$subtotal" } }, { $unset: ["vat", "vatRate"] }],
  );
  const accepted = await db.collection<EstimateDocument>(collections.estimates)
    .find({ status: "Accepted", vat: { $gt: 0 }, projectId: { $exists: true } }, { projection: { _id: 1 } }).toArray();
  for (const { _id } of accepted) await removeVatFromUnbilledProject(db, _id);
}

async function removeVatFromUnbilledProject(db: Db, estimateId: ObjectId) {
  await billingTransaction(db, async (session) => {
    const estimates = db.collection<EstimateDocument>(collections.estimates);
    const estimate = await estimates.findOne({ _id: estimateId, status: "Accepted", vat: { $gt: 0 } }, { session });
    if (!estimate?.projectId || !estimate.downpaymentPercent || !estimate.scheduleTemplate?.length) return;
    const projects = db.collection<ProjectDocument>(collections.projects);
    const project = await projects.findOne({ _id: estimate.projectId }, { session });
    if (!project?.paymentSchedule?.length) return;
    const invoices = await db.collection<InvoiceDocument>(collections.invoices)
      .find({ projectId: project._id, status: { $ne: "Void" } }, { session }).toArray();
    if (invoices.some((invoice) => invoice.status !== "Draft")) return;
    if (await db.collection<PaymentDocument>(collections.payments).countDocuments({ projectId: project._id, status: { $in: ["Pending", "Verified"] } }, { session })) return;

    const total = estimate.subtotal ?? 0;
    if (!(total > 0)) return;
    const rows = buildPaymentSchedule(total, estimate.scheduleTemplate, estimate.downpaymentPercent);
    if (rows.length !== project.paymentSchedule.length) return;
    const schedule = project.paymentSchedule.map((milestone, index) => ({ ...milestone, amount: rows[index].amount, percentage: rows[index].percentage }));
    const now = new Date();
    await projects.updateOne({ _id: project._id }, {
      $set: { contractPrice: total, subtotal: total, paymentSchedule: schedule, updatedAt: now }, $unset: { vat: "" },
    }, { session });
    for (const milestone of schedule) {
      await db.collection<InvoiceDocument>(collections.invoices).updateMany(
        { projectId: project._id, milestoneId: milestone.id, status: "Draft" },
        { $set: { amount: milestone.amount, updatedAt: now } }, { session },
      );
      await db.collection<ScheduleDocument>(collections.schedules).updateMany(
        { projectId: project._id, milestoneId: milestone.id },
        { $set: { expectedAmount: milestone.amount, updatedAt: now } }, { session },
      );
    }
    await estimates.updateOne({ _id: estimate._id }, { $set: { total, updatedAt: now }, $unset: { vat: "", vatRate: "" } }, { session });
  });
}

let cleanup: Promise<void> | undefined;

/**
 * Runs the cleanup once per server instance, the first time estimates, projects, or billing are read. A failure is
 * logged and retried on a later read instead of failing the page.
 */
export function ensureVatRemoved(db: Db) {
  cleanup ??= removeVatFromEstimates(db).catch(() => {
    console.error("VAT cleanup failed; it will retry on a later request.");
    cleanup = undefined;
  });
  return cleanup;
}
