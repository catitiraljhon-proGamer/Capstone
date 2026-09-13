import {
  collections,
  type AuditLogDocument,
  type InvoiceDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "billing-clerk" && session.role !== "admin") return forbidden();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const db = await getDatabase();
    const [pendingBillings, collectedTotals, overdueAccounts, invoicesReady, invoices, activities] =
      await Promise.all([
        db.collection(collections.invoices).countDocuments({
          status: { $in: ["Ready", "Sent", "Overdue"] },
        }),
        db
          .collection(collections.payments)
          .aggregate<{ total: number }>([
            { $match: { status: "Verified", paidAt: { $gte: monthStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
          .toArray(),
        db.collection(collections.invoices).countDocuments({ status: "Overdue" }),
        db.collection(collections.invoices).countDocuments({ status: "Ready" }),
        db
          .collection<InvoiceDocument>(collections.invoices)
          .find({ status: { $ne: "Paid" } })
          .sort({ dueDate: 1 })
          .limit(8)
          .toArray(),
        db
          .collection<AuditLogDocument>(collections.auditLogs)
          .find({ entityType: { $in: ["invoice", "payment"] } })
          .sort({ createdAt: -1 })
          .limit(5)
          .toArray(),
      ]);

    const customerIds = [...new Set(invoices.map((item) => item.customerId.toHexString()))];
    const customers = customerIds.length
      ? await db
          .collection<UserDocument>(collections.users)
          .find({ _id: { $in: customerIds.map((id) => new ObjectId(id)) } })
          .toArray()
      : [];
    const customerNames = new Map(
      customers.map((customer) => [customer._id.toHexString(), customer.name]),
    );

    return NextResponse.json({
      pendingBillings,
      collectedThisMonth: collectedTotals[0]?.total ?? 0,
      overdueAccounts,
      invoicesReady,
      queueItems: invoices.map((invoice) => ({
        title: invoice.invoiceNumber,
        meta: customerNames.get(invoice.customerId.toHexString()) ?? "Unknown client",
        amount: invoice.amount,
        status: invoice.status,
      })),
      activityItems: activities.map((activity) => ({
        title: activity.action,
        body: `${activity.actorName} updated a ${activity.entityType} record.`,
        date: activity.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
