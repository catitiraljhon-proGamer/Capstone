import {
  collections,
  type NotificationDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { isEmailConfigured, notificationEmail, sendEmail } from "@/lib/server/email";
import type { ClientSession, Db, ObjectId } from "mongodb";
import { after } from "next/server";

/**
 * Saves in-app notifications and emails the customer recipients a copy.
 * Pass the transaction session when called inside one; the emails go out
 * only after the response, so a rolled-back notification is never sent.
 */
export async function insertNotifications(
  db: Db,
  notifications: NotificationDocument[],
  session?: ClientSession,
) {
  if (!notifications.length) return;
  await db
    .collection<NotificationDocument>(collections.notifications)
    .insertMany(notifications, { session });
  queueNotificationEmails(db, notifications.map((notification) => notification._id));
}

function queueNotificationEmails(db: Db, ids: ObjectId[]) {
  if (!isEmailConfigured()) return;
  const task = () =>
    deliverNotificationEmails(db, ids).catch(() => {
      console.error("Notification email delivery failed");
    });
  try {
    // Sends after the response so slow SMTP never delays billing or approvals.
    after(task);
  } catch {
    // Outside a request (scripts): send right away instead.
    void task();
  }
}

export async function deliverNotificationEmails(db: Db, ids: ObjectId[]) {
  const notifications = db.collection<NotificationDocument>(collections.notifications);
  const users = db.collection<UserDocument>(collections.users);
  for (const id of ids) {
    // Missing when its transaction was rolled back.
    const notification = await notifications.findOne(
      { _id: id, emailedAt: { $exists: false } },
      { projection: { userId: 1 } },
    );
    if (!notification) continue;
    const recipient = await users.findOne(
      { _id: notification.userId, role: "customer", status: "active" },
      { projection: { email: 1, name: 1 } },
    );
    if (!recipient) continue;
    const claimed = await notifications.findOneAndUpdate(
      { _id: id, emailedAt: { $exists: false } },
      { $set: { emailedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!claimed) continue;
    try {
      await sendEmail(notificationEmail(recipient.email, recipient.name, claimed));
    } catch (error) {
      // Log only a fixed label; SMTP errors can echo addresses and credentials.
      console.error("Notification email failed", {
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
