import {
  collections,
  type NotificationDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, unauthorized } from "@/lib/server/api";
import { readSession } from "@/lib/server/session";
import { visibleNotificationsFor } from "@/lib/server/notification-filter";
import { ObjectId, type Filter } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

const markReadSchema = z
  .object({
    notificationId: z.string().optional(),
    href: z.string().max(500).optional(),
    all: z.boolean().optional(),
  })
  .refine((input) => input.notificationId || input.href || input.all, {
    message: "Select at least one notification to mark as read.",
  });

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();

    const userId = new ObjectId(session.id);
    const visibleFilter = visibleNotificationsFor(userId);
    const db = await getDatabase();
    const [notifications, unreadCount] = await Promise.all([
      db
        .collection<NotificationDocument>(collections.notifications)
        .find(visibleFilter)
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
      db.collection<NotificationDocument>(collections.notifications).countDocuments({
        ...visibleFilter,
        readAt: { $exists: false },
      }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((notification) => ({
        id: notification._id.toHexString(),
        title: notification.title,
        body: notification.body,
        href: notification.href,
        createdAt: notification.createdAt.toISOString(),
        isRead: Boolean(notification.readAt),
      })),
      unreadCount,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();

    const input = markReadSchema.parse(await request.json());
    if (input.notificationId && !ObjectId.isValid(input.notificationId)) {
      return NextResponse.json(
        { error: "The selected notification is invalid." },
        { status: 400 },
      );
    }

    const filter: Filter<NotificationDocument> = {
      ...visibleNotificationsFor(new ObjectId(session.id)),
      readAt: { $exists: false },
    };

    if (input.notificationId) {
      filter._id = new ObjectId(input.notificationId);
    } else if (input.href) {
      filter.$and = [{ href: input.href }];
    }

    const db = await getDatabase();
    const result = await db
      .collection<NotificationDocument>(collections.notifications)
      .updateMany(filter, { $set: { readAt: new Date() } });

    return NextResponse.json({ markedRead: result.modifiedCount });
  } catch (error) {
    return apiError(error);
  }
}
