import type { Db } from "mongodb";
import { collections, type InvoiceDocument, type PaymentDocument, type ProjectDocument, type UserDocument } from "@/lib/database/collections";
import { invoiceState, sumMoney } from "@/lib/billing";
import type { PaymentDueDto } from "@/types/billing";

const invoiceStatus = { Sent: "Due", "Partially Paid": "Partially paid", Paid: "Paid", Overdue: "Overdue" } as const;

/**
 * Every customer payment date for the admin calendar: issued invoices (with their live paid status) plus scheduled
 * construction milestones that are not invoiced yet. Drafts and void invoices are left out.
 */
export async function listPaymentDues(db: Db, now = new Date()): Promise<PaymentDueDto[]> {
  const [invoices, projects] = await Promise.all([
    db.collection<InvoiceDocument>(collections.invoices)
      .find({ status: { $nin: ["Draft", "Ready", "Void"] } }).sort({ dueDate: 1 }).limit(2_000).toArray(),
    db.collection<ProjectDocument>(collections.projects)
      .find({ status: { $ne: "Completed" }, "paymentSchedule.0": { $exists: true } }).limit(1_000).toArray(),
  ]);
  const invoicedProjectIds = invoices.flatMap((invoice) => (invoice.projectId ? [invoice.projectId] : []));
  const [payments, invoicedProjects, customers] = await Promise.all([
    invoices.length
      ? db.collection<PaymentDocument>(collections.payments)
        .find({ invoiceId: { $in: invoices.map((invoice) => invoice._id) }, status: "Verified" }, { projection: { invoiceId: 1, amount: 1 } }).toArray()
      : [],
    invoicedProjectIds.length
      ? db.collection<ProjectDocument>(collections.projects).find({ _id: { $in: invoicedProjectIds } }, { projection: { reference: 1, name: 1, paymentSchedule: 1 } }).toArray()
      : [],
    db.collection<UserDocument>(collections.users).find({ role: "customer" }, { projection: { name: 1 } }).toArray(),
  ]);
  const customerNames = new Map(customers.map((customer) => [customer._id.toHexString(), customer.name]));
  const projectsById = new Map([...invoicedProjects, ...projects].map((project) => [project._id.toHexString(), project]));
  const paidByInvoice = new Map<string, number[]>();
  for (const payment of payments) {
    const key = payment.invoiceId!.toHexString();
    paidByInvoice.set(key, [...(paidByInvoice.get(key) ?? []), payment.amount]);
  }
  const issuedInvoiceIds = new Set(invoices.map((invoice) => invoice._id.toHexString()));

  const fromInvoices = invoices.map((invoice): PaymentDueDto => {
    const project = invoice.projectId ? projectsById.get(invoice.projectId.toHexString()) : undefined;
    const milestone = project?.paymentSchedule?.find((row) => row.id === invoice.milestoneId);
    const state = invoiceState(invoice, sumMoney(paidByInvoice.get(invoice._id.toHexString()) ?? []), now);
    const designLabel = invoice.designRequestId ? `Design request ${invoice.designRequestId.toHexString().slice(-8).toUpperCase()}` : "";
    return {
      id: `invoice-${invoice._id.toHexString()}`,
      kind: invoice.designRequestId ? (invoice.feeType === "blueprint" ? "Blueprint fee" : "Design fee") : milestone?.isDownpayment ? "Downpayment" : "Progress billing",
      label: invoice.label,
      clientName: customerNames.get(invoice.customerId.toHexString()) ?? "Unknown customer",
      projectName: project ? `${project.reference} · ${project.name}` : designLabel,
      dueDate: invoice.dueDate.toISOString().slice(0, 10),
      amount: invoice.amount, balance: state.balance,
      status: invoiceStatus[state.status as keyof typeof invoiceStatus] ?? "Due",
      invoiceNumber: invoice.invoiceNumber,
    };
  });

  // Milestones the Billing Clerk has not issued yet still show on their target date.
  const upcoming = projects.flatMap((project) => (project.paymentSchedule ?? [])
    .filter((milestone) => !milestone.invoiceId || !issuedInvoiceIds.has(milestone.invoiceId.toHexString()))
    .map((milestone): PaymentDueDto => ({
      id: `milestone-${project._id.toHexString()}-${milestone.id}`,
      kind: milestone.isDownpayment ? "Downpayment" : "Progress billing",
      label: milestone.label,
      clientName: customerNames.get(project.customerId.toHexString()) ?? "Unknown customer",
      projectName: `${project.reference} · ${project.name}`,
      dueDate: milestone.targetDate.toISOString().slice(0, 10),
      amount: milestone.amount, balance: milestone.amount, status: "Upcoming",
    })));

  return [...fromInvoices, ...upcoming].sort((left, right) => left.dueDate.localeCompare(right.dueDate));
}
