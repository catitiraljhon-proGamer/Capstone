import type { Db } from "mongodb";
import { collections, type InvoiceDocument, type PaymentDocument, type ProjectDocument, type UserDocument } from "@/lib/database/collections";
import { invoiceState, manilaDate, sumMoney } from "@/lib/billing";
import { designInvoiceName } from "@/lib/server/billing";
import { promoteScheduledProjects } from "@/lib/server/project-milestones";
import { normalizePaymentMethod } from "@/types/billing";
import type { AdminCollectionsReport } from "@/types/admin-reports";

const unissued = ["Draft", "Ready", "Void"];

/** Read-only billing totals for the Admin: per-project positions plus dated invoice and payment entries. */
export async function getAdminCollectionsReport(db: Db): Promise<AdminCollectionsReport> {
  await promoteScheduledProjects(db);
  const [projects, invoices, payments] = await Promise.all([
    db.collection<ProjectDocument>(collections.projects).find({}).sort({ createdAt: -1 }).toArray(),
    db.collection<InvoiceDocument>(collections.invoices)
      .find({ status: { $nin: unissued as InvoiceDocument["status"][] } })
      .sort({ issuedAt: -1, createdAt: -1 })
      .toArray(),
    db.collection<PaymentDocument>(collections.payments)
      .find({ status: "Verified" }, { projection: { proofImage: 0 } })
      .sort({ paidAt: -1 })
      .toArray(),
  ]);
  const customerIds = [...projects, ...invoices, ...payments].map((record) => record.customerId);
  const customers = await db.collection<UserDocument>(collections.users)
    .find({ _id: { $in: customerIds } }, { projection: { name: 1 } })
    .toArray();
  const customerNames = new Map(customers.map((user) => [user._id.toHexString(), user.name]));
  const customerName = (record: { customerId: InvoiceDocument["customerId"] }) => customerNames.get(record.customerId.toHexString()) ?? "Unknown customer";
  const projectNames = new Map(projects.map((project) => [project._id.toHexString(), `${project.reference} · ${project.name}`]));

  const paidByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.invoiceId) continue;
    const key = payment.invoiceId.toHexString();
    paidByInvoice.set(key, sumMoney([paidByInvoice.get(key) ?? 0, payment.amount]));
  }
  const issued = invoices.map((invoice) => {
    const paid = paidByInvoice.get(invoice._id.toHexString()) ?? 0;
    return { invoice, paid, projectId: invoice.projectId?.toHexString() ?? "", ...invoiceState(invoice, paid) };
  });
  const invoiceById = new Map(issued.map((entry) => [entry.invoice._id.toHexString(), entry]));
  const projectNameFor = (invoice: InvoiceDocument | undefined, projectId: string) =>
    invoice?.designRequestId ? designInvoiceName(invoice) : projectNames.get(projectId) ?? "Unknown project";

  return {
    projects: projects.map((project) => {
      const id = project._id.toHexString();
      const projectInvoices = issued.filter((entry) => entry.projectId === id);
      return {
        id, reference: project.reference, name: project.name, status: project.status,
        customerName: customerName(project),
        contractPrice: project.contractPrice,
        billed: sumMoney(projectInvoices.map((entry) => entry.invoice.amount)),
        collected: sumMoney(payments.filter((payment) => payment.projectId?.equals(project._id)).map((payment) => payment.amount)),
        outstanding: sumMoney(projectInvoices.map((entry) => entry.balance)),
        overdue: sumMoney(projectInvoices.filter((entry) => entry.overdue).map((entry) => entry.balance)),
      };
    }),
    invoiced: issued.map(({ invoice, paid, projectId, balance, status }) => ({
      id: invoice._id.toHexString(), invoiceNumber: invoice.invoiceNumber, customerName: customerName(invoice),
      projectId, projectName: projectNameFor(invoice, projectId), label: invoice.label,
      issuedOn: manilaDate(invoice.issuedAt ?? invoice.createdAt), dueDate: invoice.dueDate.toISOString().slice(0, 10),
      amount: invoice.amount, paid, balance, status,
    })),
    collected: payments.map((payment) => {
      const invoice = payment.invoiceId ? invoiceById.get(payment.invoiceId.toHexString())?.invoice : undefined;
      const projectId = payment.projectId?.toHexString() ?? "";
      return {
        id: payment._id.toHexString(), reference: payment.reference, customerName: customerName(payment),
        projectId, projectName: projectNameFor(invoice, projectId),
        invoiceNumber: invoice?.invoiceNumber ?? (payment.invoiceId ? "Unavailable invoice" : "Unallocated"),
        paidOn: manilaDate(payment.paidAt), method: normalizePaymentMethod(payment.method), amount: payment.amount,
        receiptNumber: payment.receipt?.number ?? "Legacy record",
      };
    }),
  };
}
