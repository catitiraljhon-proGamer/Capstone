import {
  collections,
  type NotificationDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { isEmailConfigured, notificationEmail, sendEmail } from "@/lib/server/email";
import { getSystemSettings } from "@/lib/server/maintenance";
import type { SystemSettings } from "@/lib/system-settings";
import type { UserRole } from "@/types/domain";
import type { ClientSession, Db, ObjectId } from "mongodb";
import { after } from "next/server";

/**
 * Saves in-app notifications and emails each recipient a copy, for the roles the Admin keeps email copies on for.
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

/** Maintenance > Notifications and reminders turns email copies on or off per role. */
const emailCopySetting: Record<UserRole, keyof SystemSettings> = {
  admin: "emailCopiesAdmin",
  "billing-clerk": "emailCopiesBillingClerk",
  customer: "emailCopiesCustomer",
};

export async function deliverNotificationEmails(db: Db, ids: ObjectId[]) {
  const settings = await getSystemSettings(db);
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
      { _id: notification.userId, status: "active" },
      { projection: { email: 1, name: 1, role: 1 } },
    );
    if (!recipient || !settings[emailCopySetting[recipient.role]]) continue;
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
