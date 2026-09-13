import {
  collections,
  type ApprovalDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { syncPendingWorkflowApprovals } from "@/lib/server/approvals";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const db = await getDatabase();
    await syncPendingWorkflowApprovals(db);
    const [activeProjects, pendingApprovals, pendingBilling, totalClients, totalUsers, approvals] =
      await Promise.all([
        db.collection(collections.projects).countDocuments({ status: "Active" }),
        db.collection(collections.approvals).countDocuments({ status: "Pending" }),
        db.collection(collections.invoices).countDocuments({
          status: { $in: ["Draft", "Ready", "Sent", "Overdue"] },
        }),
        db.collection(collections.users).countDocuments({ role: "customer", status: "active" }),
        db.collection(collections.users).countDocuments({ status: "active" }),
        db
          .collection<ApprovalDocument>(collections.approvals)
          .find({ status: "Pending" })
          .sort({ createdAt: 1 })
          .limit(5)
          .toArray(),
      ]);

    const customerIds = [...new Set(approvals.map((item) => item.customerId.toHexString()))];
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
      summary: { activeProjects, pendingApprovals, pendingBilling, totalClients, totalUsers },
      pendingApprovals: approvals.map((approval) => ({
        reference: approval.reference,
        client: customerNames.get(approval.customerId.toHexString()) ?? "Unknown client",
        type: approval.recordType,
        status: approval.status,
        href: "/admin/approvals",
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
