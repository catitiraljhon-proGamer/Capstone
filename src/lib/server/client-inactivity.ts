import { ObjectId, type Db } from "mongodb";
import {
  collections, type DesignRequestDocument, type EstimateDocument, type InvoiceDocument, type PaymentDocument,
  type ProjectDocument, type UserDocument,
} from "@/lib/database/collections";
import { invoiceState, sumMoney } from "@/lib/billing";
import { recordAuditLog } from "@/lib/server/audit";
import { getSystemSettings } from "@/lib/server/maintenance";
import { insertNotifications } from "@/lib/server/notifications";


const day = 86_400_000;
const systemActor = { id: "000000000000000000000000", name: "System (automatic)", role: "admin" as const };

/** Anything still open keeps the client active: unfinished work, a new request, or money still owed. */
async function hasOpenWork(db: Db, customerId: ObjectId, since: Date) {
  const [designs, estimates, pendingPayments] = await Promise.all([
    db.collection<DesignRequestDocument>(collections.designRequests).countDocuments({
      customerId,
      $or: [
        { status: { $in: ["Pending", "In review", "Approved", "In customer review", "Changes requested"] } },
        { status: "Design approved", createdAt: { $gt: since } },
      ],
    }),
    db.collection<EstimateDocument>(collections.estimates).countDocuments({ customerId, status: { $in: ["Requested", "Draft", "Sent", "Revision requested"] } }),
    db.collection<PaymentDocument>(collections.payments).countDocuments({ customerId, status: "Pending" }),
  ]);
  if (designs || estimates || pendingPayments) return true;
  const invoices = await db.collection<InvoiceDocument>(collections.invoices)
    .find({ customerId, status: { $in: ["Sent", "Partially Paid", "Overdue"] } }).toArray();
  for (const invoice of invoices) {
    const payments = await db.collection<PaymentDocument>(collections.payments)
      .find({ invoiceId: invoice._id, status: "Verified" }, { projection: { amount: 1 } }).toArray();
    if (invoiceState(invoice, sumMoney(payments.map((payment) => payment.amount))).balance > 0) return true;
  }
  return false;
}

/**
 * Daily job. When every project of a client is Completed and nothing else is open, the client is warned, then archived
 * and disabled a set number of days after the last completion (30 by default) and at least the warning period (7 by
 * default) after the warning. Both are Admin settings. Unarchiving restores access.
 */
export async function archiveInactiveClients(db: Db, now = new Date()) {
  const { inactiveArchiveDays, inactiveNoticeDays } = await getSystemSettings(db);
  const users = db.collection<UserDocument>(collections.users);
  const projects = db.collection<ProjectDocument>(collections.projects);
  const candidateIds = (await projects.find({ status: "Completed" }, { projection: { customerId: 1 } }).toArray())
    .map((project) => project.customerId.toHexString());
  const result = { noticed: 0, archived: 0 };

  for (const id of new Set(candidateIds)) {
    const customer = await users.findOne({ _id: new ObjectId(id), role: "customer", status: "active", clientArchivedAt: null });
    if (!customer) continue;
    const owned = await projects.find({ customerId: customer._id }).toArray();
    if (owned.some((project) => project.status !== "Completed")) continue;
    const completedAt = new Date(Math.max(...owned.map((project) => (project.completedAt ?? project.updatedAt).getTime())));
    // An admin unarchiving the client restarts the count.
    const inactiveSince = new Date(Math.max(completedAt.getTime(), customer.reactivatedAt?.getTime() ?? 0));
    if (await hasOpenWork(db, customer._id, inactiveSince)) continue;

    const archiveOn = new Date(inactiveSince.getTime() + inactiveArchiveDays * day);
    // The customer is always warned first, and archived no sooner than the warning period after that warning. Clients
    // already past the archive period when this started (or when a run was missed) still get the full warning period.
    const noticeSentAt = customer.inactivityNoticeFor?.getTime() === inactiveSince.getTime() ? customer.inactivityNoticeSentAt : undefined;
    if (noticeSentAt) {
      if (now.getTime() < Math.max(archiveOn.getTime(), noticeSentAt.getTime() + inactiveNoticeDays * day)) continue;
      const archived = await users.updateOne(
        { _id: customer._id, status: "active", clientArchivedAt: null },
        { $set: { clientArchivedAt: now, autoArchivedAt: now, status: "disabled", updatedAt: now }, $inc: { authVersion: 1 } },
      );
      if (!archived.modifiedCount) continue;
      await recordAuditLog({
        db, actor: systemActor, action: "client.auto-archived", entityType: "user", entityId: customer._id,
        details: { reason: `No open work for ${inactiveArchiveDays} days after the last project was completed`, inactiveSince: inactiveSince.toISOString() },
        createdAt: now,
      });
      const admins = await users.find({ role: "admin", status: "active" }, { projection: { _id: 1 } }).toArray();
      await insertNotifications(db, admins.map((admin) => ({
        _id: new ObjectId(), userId: admin._id, title: "Client archived automatically",
        body: `${customer.name} was archived and their account disabled after ${inactiveArchiveDays} days with no open work since their project was completed. Unarchive them in Client to restore access.`,
        href: "/admin/clients", kind: "client-auto-archived", entityId: customer._id, createdAt: now,
      })));
      result.archived += 1;
    } else if (now.getTime() >= archiveOn.getTime() - inactiveNoticeDays * day) {
      const marked = await users.updateOne(
        { _id: customer._id, inactivityNoticeFor: { $ne: inactiveSince } },
        { $set: { inactivityNoticeFor: inactiveSince, inactivityNoticeSentAt: now } },
      );
      if (!marked.modifiedCount) continue;
      const closeOn = new Date(Math.max(archiveOn.getTime(), now.getTime() + inactiveNoticeDays * day))
        .toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" });
      await insertNotifications(db, [{
        _id: new ObjectId(), userId: customer._id, title: `Your account will be archived on ${closeOn}`,
        body: `Your project is complete. With no new requests, your account will be archived and closed on ${closeOn}. Download your blueprint and receipts before then, or contact G4 Builders if you need more work.`,
        href: "/customer/dream-house", kind: "client-inactivity-notice", entityId: customer._id, createdAt: now,
      }]);
      result.noticed += 1;
    }
  }
  return result;
}
