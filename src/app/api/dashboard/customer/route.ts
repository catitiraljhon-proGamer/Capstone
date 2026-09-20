import {
  collections,
  type HouseDesignDocument,
  type InvoiceDocument,
  type NotificationDocument,
  type ProjectDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { readSession } from "@/lib/server/session";
import { visibleNotificationsFor } from "@/lib/server/notification-filter";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "customer") return forbidden();

    const customerId = new ObjectId(session.id);
    const db = await getDatabase();
    const [project, pendingRequests, paymentTotals, invoices, notifications, unreadNotifications] =
      await Promise.all([
        db
          .collection<ProjectDocument>(collections.projects)
          .findOne(
            { customerId, status: { $in: ["Pending", "Active", "On hold"] } },
            { sort: { createdAt: -1 } },
          ),
        db.collection(collections.designRequests).countDocuments({
          customerId,
          status: { $in: ["Pending", "In review"] },
        }),
        db
          .collection(collections.payments)
          .aggregate<{ total: number }>([
            { $match: { customerId, status: "Verified" } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ])
          .toArray(),
        db
          .collection<InvoiceDocument>(collections.invoices)
          .find({ customerId })
          .sort({ dueDate: 1 })
          .toArray(),
        db
          .collection<NotificationDocument>(collections.notifications)
          .find(visibleNotificationsFor(customerId))
          .sort({ createdAt: -1 })
          .limit(10)
          .toArray(),
        db.collection<NotificationDocument>(collections.notifications).countDocuments({
          ...visibleNotificationsFor(customerId),
          readAt: { $exists: false },
        }),
      ]);

    const design = project?.houseDesignId
      ? await db
          .collection<HouseDesignDocument>(collections.houseDesigns)
          .findOne({ _id: project.houseDesignId })
      : null;
    const totalPaid = paymentTotals[0]?.total ?? 0;
    const totalContractPrice = project?.contractPrice ?? 0;

    return NextResponse.json({
      currentDesign: design?.name ?? null,
      estimatedBudget: totalContractPrice,
      pendingRequests,
      totalContractPrice,
      totalPaid,
      balanceDue: Math.max(0, totalContractPrice - totalPaid),
      billingStages: invoices.map((invoice) => ({
        id: invoice._id.toHexString(),
        label: invoice.label,
        percentage: invoice.progressPercentage,
        amount: invoice.amount,
        status: invoice.status,
      })),
      notifications: notifications.map((notification) => ({
        id: notification._id.toHexString(),
        title: notification.title,
        body: notification.body,
        href: notification.href,
        createdAt: notification.createdAt.toISOString(),
        isRead: Boolean(notification.readAt),
      })),
      unreadNotifications,
    });
  } catch (error) {
    return apiError(error);
  }
}
