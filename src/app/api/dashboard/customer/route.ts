import {
  collections,
  type DesignRequestDocument,
  type NotificationDocument,
  type ProjectDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { readSession } from "@/lib/server/session";
import { visibleNotificationsFor } from "@/lib/server/notification-filter";
import { getBillingData } from "@/lib/server/billing";
import { sumMoney } from "@/lib/billing";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "customer") return forbidden();

    const customerId = new ObjectId(session.id);
    const db = await getDatabase();
    const [project, pendingRequests, billing, notifications, unreadNotifications, latestRequest] =
      await Promise.all([
        db
          .collection<ProjectDocument>(collections.projects)
          .findOne(
            { customerId, status: { $in: ["Awaiting downpayment", "Scheduled", "Pending", "Active", "On hold"] } },
            { sort: { createdAt: -1 } },
          ),
        db.collection(collections.designRequests).countDocuments({
          customerId,
          status: { $in: ["Pending", "In review"] },
        }),
        getBillingData(db, session),
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
        db.collection<DesignRequestDocument>(collections.designRequests).findOne({ customerId }, { sort: { createdAt: -1 }, projection: { floorArea: 1, finish: 1 } }),
      ]);

    const totalPaid = sumMoney(billing.payments.filter((payment) => payment.status === "Verified").map((payment) => payment.amount));
    const totalContractPrice = sumMoney(billing.projects.map((item) => item.contractPrice));

    return NextResponse.json({
      currentDesign: latestRequest ? `${latestRequest.floorArea} sqm · ${latestRequest.finish}` : null,
      estimatedBudget: project?.contractPrice ?? 0,
      pendingRequests,
      totalContractPrice,
      totalPaid,
      balanceDue: sumMoney(billing.invoices.filter((item) => !["Draft", "Ready", "Void"].includes(item.status)).map((item) => item.balance)),
      billingStages: billing.invoices.map((invoice) => ({
        id: invoice.id,
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
