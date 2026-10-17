import type { Db } from "mongodb";
import { collections, type InvoiceDocument, type PaymentDocument, type ProjectDocument, type UserDocument } from "@/lib/database/collections";
import { invoiceState, manilaDate, sumMoney } from "@/lib/billing";
import { promoteScheduledProjects } from "@/lib/server/project-milestones";
import type { AdminCollectionsReport } from "@/types/admin-reports";

const unissued = ["Draft", "Ready", "Void"];

/** Read-only billing totals for the Admin: per-project positions plus dated entries for monthly summaries. */
export async function getAdminCollectionsReport(db: Db): Promise<AdminCollectionsReport> {
  await promoteScheduledProjects(db);
  const [projects, invoices, payments] = await Promise.all([
    db.collection<ProjectDocument>(collections.projects).find({}).sort({ createdAt: -1 }).toArray(),
    db.collection<InvoiceDocument>(collections.invoices).find({ status: { $nin: unissued as InvoiceDocument["status"][] } }).toArray(),
    db.collection<PaymentDocument>(collections.payments)
      .find({ status: "Verified" }, { projection: { projectId: 1, invoiceId: 1, amount: 1, paidAt: 1 } })
      .toArray(),
  ]);
  const customers = await db.collection<UserDocument>(collections.users)
    .find({ _id: { $in: projects.map((project) => project.customerId) } }, { projection: { name: 1 } })
    .toArray();
  const customerNames = new Map(customers.map((user) => [user._id.toHexString(), user.name]));

  const paidByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.invoiceId) continue;
    const key = payment.invoiceId.toHexString();
    paidByInvoice.set(key, sumMoney([paidByInvoice.get(key) ?? 0, payment.amount]));
  }
  const issued = invoices.map((invoice) => ({
    invoice,
    projectId: invoice.projectId?.toHexString() ?? "",
    ...invoiceState(invoice, paidByInvoice.get(invoice._id.toHexString()) ?? 0),
  }));

  return {
    projects: projects.map((project) => {
      const id = project._id.toHexString();
      const projectInvoices = issued.filter((entry) => entry.projectId === id);
      return {
        id, reference: project.reference, name: project.name, status: project.status,
        customerName: customerNames.get(project.customerId.toHexString()) ?? "Unknown customer",
        contractPrice: project.contractPrice,
        billed: sumMoney(projectInvoices.map((entry) => entry.invoice.amount)),
        collected: sumMoney(payments.filter((payment) => payment.projectId?.equals(project._id)).map((payment) => payment.amount)),
        outstanding: sumMoney(projectInvoices.map((entry) => entry.balance)),
        overdue: sumMoney(projectInvoices.filter((entry) => entry.overdue).map((entry) => entry.balance)),
      };
    }),
    invoiced: issued.map(({ invoice, projectId }) => ({
      projectId, issuedOn: manilaDate(invoice.issuedAt ?? invoice.createdAt), amount: invoice.amount,
    })),
    collected: payments.map((payment) => ({
      projectId: payment.projectId?.toHexString() ?? "", paidOn: manilaDate(payment.paidAt), amount: payment.amount,
    })),
  };
}
