import type { ClientSession, Db, ObjectId } from "mongodb";
import { collections, type InvoiceDocument, type PaymentDocument, type ProjectDocument } from "@/lib/database/collections";
import { invoiceState, manilaDate, sumMoney, toCentavos } from "@/lib/billing";
import type { PaymentMilestoneDto } from "@/types/construction";

/** Non-void invoices and verified payments for a set of projects, keyed for milestone lookups. */
export type ProjectBilling = {
  invoices: Map<string, InvoiceDocument>;
  paidByInvoice: Map<string, number>;
  paidByProject: Map<string, number>;
};

/** Builds the lookup maps from already-loaded invoices and payments. */
export function projectBillingFrom(
  invoices: InvoiceDocument[],
  payments: Pick<PaymentDocument, "invoiceId" | "projectId" | "amount" | "status">[],
): ProjectBilling {
  const paidByInvoice = new Map<string, number[]>();
  const paidByProject = new Map<string, number[]>();
  for (const payment of payments) {
    if (payment.status !== "Verified") continue;
    if (payment.invoiceId) {
      const key = payment.invoiceId.toHexString();
      paidByInvoice.set(key, [...(paidByInvoice.get(key) ?? []), payment.amount]);
    }
    if (payment.projectId) {
      const key = payment.projectId.toHexString();
      paidByProject.set(key, [...(paidByProject.get(key) ?? []), payment.amount]);
    }
  }
  return {
    invoices: new Map(invoices.filter((invoice) => invoice.status !== "Void").map((invoice) => [invoice._id.toHexString(), invoice])),
    paidByInvoice: new Map([...paidByInvoice].map(([key, amounts]) => [key, sumMoney(amounts)])),
    paidByProject: new Map([...paidByProject].map(([key, amounts]) => [key, sumMoney(amounts)])),
  };
}

export async function loadProjectBilling(db: Db, projectIds: ObjectId[], session?: ClientSession): Promise<ProjectBilling> {
  if (!projectIds.length) return projectBillingFrom([], []);
  const [invoices, payments] = await Promise.all([
    db.collection<InvoiceDocument>(collections.invoices).find({ projectId: { $in: projectIds }, status: { $ne: "Void" } }, { session }).toArray(),
    db.collection<PaymentDocument>(collections.payments).find(
      { projectId: { $in: projectIds }, status: "Verified" }, { session, projection: { invoiceId: 1, projectId: 1, amount: 1, status: 1 } },
    ).toArray(),
  ]);
  return projectBillingFrom(invoices, payments);
}

/**
 * Payment-schedule rows of a project with the state of their invoices.
 * `hideUnreleased` keeps Draft/Ready invoices private to staff, so customers
 * see those milestones as upcoming.
 */
export function milestoneDtos(project: Pick<ProjectDocument, "paymentSchedule">, billing: ProjectBilling, hideUnreleased = false): PaymentMilestoneDto[] {
  return (project.paymentSchedule ?? []).map((milestone) => {
    let invoice = milestone.invoiceId ? billing.invoices.get(milestone.invoiceId.toHexString()) : undefined;
    if (invoice && hideUnreleased && ["Draft", "Ready"].includes(invoice.status)) invoice = undefined;
    const paid = invoice ? billing.paidByInvoice.get(invoice._id.toHexString()) ?? 0 : 0;
    const state = invoice ? invoiceState(invoice, paid) : null;
    return {
      id: milestone.id, label: milestone.label, description: milestone.description,
      percentage: milestone.percentage, amount: milestone.amount,
      targetDate: milestone.targetDate.toISOString().slice(0, 10), isDownpayment: milestone.isDownpayment,
      invoice: invoice && state ? {
        id: invoice._id.toHexString(), number: invoice.invoiceNumber, status: state.status,
        amount: invoice.amount, paid, balance: state.balance, dueDate: invoice.dueDate.toISOString().slice(0, 10),
      } : null,
      paid,
      status: !invoice ? "Upcoming" : toCentavos(paid) >= toCentavos(invoice.amount) ? "Paid" : paid > 0 ? "Partially paid" : "Invoiced",
    };
  });
}

/** Scheduled projects whose start date has arrived become Active. Safe to call before any read. */
export async function promoteScheduledProjects(db: Db, now = new Date()) {
  await db.collection<ProjectDocument>(collections.projects).updateMany(
    { status: "Scheduled", startDate: { $lte: new Date(`${manilaDate(now)}T00:00:00.000Z`) } },
    { $set: { status: "Active", updatedAt: now } },
  );
}
