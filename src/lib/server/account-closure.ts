import { jwtVerify, SignJWT } from "jose";
import { type Db, type Filter, ObjectId } from "mongodb";
import { after, type NextResponse } from "next/server";
import { z } from "zod";
import {
  collections, type DesignRequestDocument, type EstimateDocument, type InvoiceDocument, type NotificationDocument,
  type PaymentDocument, type ProjectDocument, type UserDocument, type WarrantyClaimDocument,
} from "@/lib/database/collections";
import {
  closureReasons, dayMs, deleteConfirmWord, longManilaDate,
  type AccountClosureDto, type ClosureCheck, type ReactivationDto,
} from "@/lib/account-closure";
import { invoiceState, manilaDate, sumMoney } from "@/lib/billing";
import { openWarrantyClaimStatuses } from "@/lib/warranty";
import { recordAuditLog } from "@/lib/server/audit";
import { getAuthSecret } from "@/lib/server/auth-secret";
import {
  accountDeactivatedEmail, accountDeletedEmail, accountDeletionReminderEmail, emailErrorDetails, isEmailConfigured,
  sendEmail, type EmailMessage,
} from "@/lib/server/email";
import { getSystemSettings } from "@/lib/server/maintenance";
import { insertNotifications } from "@/lib/server/notifications";
import { projectWarranty } from "@/lib/server/warranty";
import type { SessionUser } from "@/types/domain";

export class AccountClosureError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type Actor = Pick<SessionUser, "id" | "name" | "role">;
const systemActor: Actor = { id: "000000000000000000000000", name: "System (automatic)", role: "admin" };
const openDesignStatuses = ["Pending", "In review", "Approved", "In customer review", "Changes requested"] as const;
const openEstimateStatuses = ["Requested", "Draft", "Sent", "Revision requested"] as const;

/** Active accounts, plus deactivated ones, which can still sign in (or reset a forgotten password) to reactivate. */
export const signInAccountFilter: Filter<UserDocument> = {
  deletedAt: { $exists: false },
  $or: [{ status: "active" }, { status: "disabled", deactivation: { $exists: true } }],
};

export function isDeactivated(user: Pick<UserDocument, "status" | "deactivation" | "deletedAt">) {
  return user.status === "disabled" && Boolean(user.deactivation) && !user.deletedAt;
}

const peso = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const andMore = (count: number) => (count > 1 ? ` (and ${count - 1} more)` : "");

/** Anything still open with G4 Builders keeps the account from being deactivated or deleted. */
async function closureChecks(db: Db, customerId: ObjectId): Promise<ClosureCheck[]> {
  const [projects, invoices, pendingPayments, designs, estimates, claims] = await Promise.all([
    db.collection<ProjectDocument>(collections.projects)
      .find({ customerId, status: { $ne: "Completed" } }, { projection: { name: 1, status: 1 } }).toArray(),
    db.collection<InvoiceDocument>(collections.invoices)
      .find({ customerId, status: { $in: ["Sent", "Partially Paid", "Overdue"] } }).sort({ dueDate: 1 }).toArray(),
    db.collection<PaymentDocument>(collections.payments).countDocuments({ customerId, status: "Pending" }),
    db.collection<DesignRequestDocument>(collections.designRequests).countDocuments({ customerId, status: { $in: [...openDesignStatuses] } }),
    db.collection<EstimateDocument>(collections.estimates).countDocuments({ customerId, status: { $in: [...openEstimateStatuses] } }),
    db.collection<WarrantyClaimDocument>(collections.warrantyClaims).countDocuments({ customerId, status: { $in: [...openWarrantyClaimStatuses] } }),
  ]);
  const unpaid: { invoiceNumber: string; balance: number }[] = [];
  for (const invoice of invoices) {
    const payments = await db.collection<PaymentDocument>(collections.payments)
      .find({ invoiceId: invoice._id, status: "Verified" }, { projection: { amount: 1 } }).toArray();
    const { balance } = invoiceState(invoice, sumMoney(payments.map((payment) => payment.amount)));
    if (balance > 0) unpaid.push({ invoiceNumber: invoice.invoiceNumber, balance });
  }
  const openRequests = [designs ? plural(designs, "design request") : "", estimates ? plural(estimates, "estimate") : ""].filter(Boolean);

  return [
    {
      key: "projects", title: "No project in progress", ok: projects.length === 0,
      detail: projects.length ? `${projects[0].name} is ${projects[0].status.toLowerCase()}${andMore(projects.length)}.` : "Nothing is being built for you right now.",
      href: "/customer/dream-house", linkLabel: "Dream House",
    },
    {
      key: "balance", title: "No unpaid balance", ok: unpaid.length === 0,
      detail: unpaid.length ? `${unpaid[0].invoiceNumber} still has ${peso(unpaid[0].balance)} to pay${andMore(unpaid.length)}.` : "All invoices are fully paid.",
      href: "/customer/billing", linkLabel: "Billing Status",
    },
    {
      key: "payments", title: "No payment waiting for review", ok: pendingPayments === 0,
      detail: pendingPayments ? `${plural(pendingPayments, "payment")} still waiting for the Billing Clerk to verify.` : "Nothing is waiting for the Billing Clerk.",
      href: "/customer/billing", linkLabel: "Billing Status",
    },
    {
      key: "requests", title: "No open design request or estimate", ok: openRequests.length === 0,
      detail: openRequests.length ? `${openRequests.join(" and ")} still open.` : "Nothing is waiting on you or the team.",
      href: designs ? "/customer/design-requests" : "/customer/dream-house", linkLabel: designs ? "Design Requests" : "Dream House",
    },
    {
      key: "claims", title: "No open warranty claim", ok: claims === 0,
      detail: claims ? `${plural(claims, "warranty claim")} still open.` : "No problems reported.",
      href: "/customer/dream-house", linkLabel: "Dream House",
    },
  ];
}

async function activeCustomer(db: Db, actor: SessionUser) {
  if (actor.role !== "customer") throw new AccountClosureError("Only customers can deactivate or delete their own account.", 403);
  const user = await db.collection<UserDocument>(collections.users).findOne({
    _id: new ObjectId(actor.id), role: "customer", status: "active", deletedAt: { $exists: false },
  });
  if (!user) throw new AccountClosureError("Your account could not be found.", 404);
  return user;
}

export async function getAccountClosure(db: Db, actor: SessionUser, now = new Date()): Promise<AccountClosureDto> {
  const customer = await activeCustomer(db, actor);
  const settings = await getSystemSettings(db);
  const checks = await closureChecks(db, customer._id);
  const completed = await db.collection<ProjectDocument>(collections.projects).find({ customerId: customer._id, status: "Completed" }).toArray();
  const warrantyEnds = completed
    .map((project) => projectWarranty(project, settings.warrantyMonths, now))
    .flatMap((warranty) => (warranty?.active ? [warranty.endsOn] : []))
    .sort();
  const deletesAt = new Date(now.getTime() + settings.deactivatedDeleteDays * dayMs);
  return {
    checks,
    canClose: checks.every((check) => check.ok),
    warrantyUntil: warrantyEnds.length ? longManilaDate(new Date(`${warrantyEnds.at(-1)}T00:00:00+08:00`)) : null,
    deleteDays: settings.deactivatedDeleteDays,
    reminderDays: settings.deactivationReminderDays,
    deletesOn: longManilaDate(deletesAt),
    remindsOn: longManilaDate(new Date(deletesAt.getTime() - settings.deactivationReminderDays * dayMs)),
  };
}

const closeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deactivate"), reason: z.enum(closureReasons).optional() }).strict(),
  z.object({
    action: z.literal("delete"),
    reason: z.enum(closureReasons).optional(),
    confirm: z.string().trim().toUpperCase().pipe(z.literal(deleteConfirmWord, { error: `Type ${deleteConfirmWord} to confirm.` })),
  }).strict(),
]);

/** Emails go out after the response, so slow SMTP never holds up the customer; a failed send is only logged. */
function queueEmail(message: EmailMessage) {
  if (!isEmailConfigured()) return;
  const task = () => sendEmail(message).catch((error: unknown) => {
    console.error("Account email failed", emailErrorDetails(error));
  });
  try {
    after(task);
  } catch {
    // Outside a request (scripts and tests): send right away instead.
    void task();
  }
}

async function notifyAdmins(db: Db, customerId: ObjectId, title: string, body: string, href: string, now: Date) {
  const admins = await db.collection<UserDocument>(collections.users)
    .find({ role: "admin", status: "active" }, { projection: { _id: 1 } }).toArray();
  await insertNotifications(db, admins.map((admin) => ({
    _id: new ObjectId(), userId: admin._id, title, body, href, kind: "account", entityId: customerId, createdAt: now,
  })));
}

/**
 * Removes the sign-in, email, and personal details, and the customer's notifications. The record itself stays, with
 * the name, so their projects, invoices, and payments keep their owner. The old email is freed for a new account.
 */
async function deleteAccount(db: Db, customer: UserDocument, actor: Actor, now: Date, reason?: string) {
  const deleted = await db.collection<UserDocument>(collections.users).updateOne(
    { _id: customer._id, role: "customer", deletedAt: { $exists: false } },
    {
      $set: { status: "disabled", email: `deleted-${customer._id.toHexString()}@deleted.invalid`, deletedAt: now, updatedAt: now },
      $unset: { passwordHash: "", googleSub: "", clientDetails: "", deactivation: "" },
      $inc: { authVersion: 1 },
    },
  );
  if (!deleted.modifiedCount) return false;
  await db.collection<NotificationDocument>(collections.notifications).deleteMany({ userId: customer._id });

  const automatic = actor.id === systemActor.id;
  const deactivatedOn = customer.deactivation ? longManilaDate(customer.deactivation.at) : null;
  await recordAuditLog({
    db, actor, action: automatic ? "account.auto-deleted" : "account.deleted", entityType: "user", entityId: customer._id,
    details: { name: customer.name, ...(reason ? { reason } : {}), ...(automatic && deactivatedOn ? { deactivatedOn } : {}) },
    createdAt: now,
  });
  await notifyAdmins(
    db, customer._id,
    automatic ? "Deactivated account deleted" : "Client deleted their account",
    automatic
      ? `${customer.name}'s account was deleted automatically. They deactivated it on ${deactivatedOn} and didn't sign back in. Their projects, invoices, and payments are kept.`
      : `${customer.name} deleted their account. Their projects, invoices, and payments are kept.`,
    "/admin/audit-logs", now,
  );
  queueEmail(accountDeletedEmail(customer.email, customer.name));
  return true;
}

/**
 * The customer deactivates or deletes their own account from Manage Account, once nothing is open. Deactivating signs
 * them out and starts the countdown to deletion; deleting happens right away.
 */
export async function closeAccount(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  const input = closeSchema.parse(raw);
  const customer = await activeCustomer(db, actor);
  if (!(await closureChecks(db, customer._id)).every((check) => check.ok)) {
    throw new AccountClosureError("Finish your open project, payments, and requests first. Then you can deactivate or delete your account.", 409);
  }

  if (input.action === "delete") {
    if (!(await deleteAccount(db, customer, actor, now, input.reason))) {
      throw new AccountClosureError("Your account could not be deleted. Refresh the page and try again.", 409);
    }
    return { action: "delete" as const };
  }

  const { deactivatedDeleteDays } = await getSystemSettings(db);
  const deletesAt = new Date(now.getTime() + deactivatedDeleteDays * dayMs);
  const updated = await db.collection<UserDocument>(collections.users).updateOne(
    { _id: customer._id, status: "active", deletedAt: { $exists: false } },
    {
      $set: { status: "disabled", deactivation: { at: now, deletesAt, ...(input.reason ? { reason: input.reason } : {}) }, updatedAt: now },
      // Signs the customer out everywhere.
      $inc: { authVersion: 1 },
    },
  );
  if (!updated.modifiedCount) throw new AccountClosureError("Your account could not be deactivated. Refresh the page and try again.", 409);

  const deletesOn = longManilaDate(deletesAt);
  await recordAuditLog({
    db, actor, action: "account.deactivated", entityType: "user", entityId: customer._id,
    details: { deletesOn, ...(input.reason ? { reason: input.reason } : {}) }, createdAt: now,
  });
  await notifyAdmins(
    db, customer._id, "Client deactivated their account",
    `${customer.name} deactivated their account. It will be deleted on ${deletesOn} unless they sign back in.`,
    "/admin/clients", now,
  );
  queueEmail(accountDeactivatedEmail(customer.email, customer.name, deletesOn));
  return { action: "deactivate" as const, deletesOn: manilaDate(deletesAt) };
}

/* ---------- Signing back in ---------- */

export const reactivationCookieName = "g4_reactivate";
const reactivationMinutes = 15;
const reactivationCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** After a deactivated customer proves who they are, this short-lived cookie lets them choose to reactivate. */
export async function setReactivationCookie(response: NextResponse, user: UserDocument, rememberMe: boolean) {
  const token = await new SignJWT({ purpose: "reactivate", authVersion: user.authVersion ?? 0, rememberMe })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user._id.toHexString())
    .setIssuedAt()
    .setExpirationTime(`${reactivationMinutes}m`)
    .sign(getAuthSecret());
  response.cookies.set(reactivationCookieName, token, { ...reactivationCookieOptions, maxAge: reactivationMinutes * 60 });
}

export function clearReactivationCookie(response: NextResponse) {
  response.cookies.set(reactivationCookieName, "", { ...reactivationCookieOptions, maxAge: 0 });
}

/** The deactivated account a reactivation cookie belongs to, while it is still waiting to be reactivated. */
export async function findReactivation(db: Db, token: string | undefined) {
  if (!token) return null;
  let claims: { userId: ObjectId; authVersion: number; rememberMe: boolean };
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (payload.purpose !== "reactivate" || !payload.sub || !ObjectId.isValid(payload.sub) || typeof payload.authVersion !== "number") return null;
    claims = { userId: new ObjectId(payload.sub), authVersion: payload.authVersion, rememberMe: payload.rememberMe === true };
  } catch {
    return null;
  }
  const user = await db.collection<UserDocument>(collections.users).findOne({ _id: claims.userId });
  if (!user || !isDeactivated(user) || (user.authVersion ?? 0) !== claims.authVersion) return null;
  return { user, rememberMe: claims.rememberMe };
}

export function toReactivationDto(user: UserDocument): ReactivationDto {
  return {
    name: user.name,
    deactivatedOn: user.deactivation ? longManilaDate(user.deactivation.at) : "",
    deletesOn: user.deactivation ? longManilaDate(user.deactivation.deletesAt) : "",
  };
}

export async function reactivateAccount(db: Db, user: UserDocument, now = new Date()) {
  const updated = await db.collection<UserDocument>(collections.users).findOneAndUpdate(
    { _id: user._id, status: "disabled", "deactivation.at": user.deactivation?.at, deletedAt: { $exists: false } },
    { $set: { status: "active", updatedAt: now }, $unset: { deactivation: "" } },
    { returnDocument: "after" },
  );
  if (!updated) throw new AccountClosureError("Your account could not be reactivated. Sign in again to try once more.", 409);
  await recordAuditLog({
    db, actor: { id: updated._id.toHexString(), name: updated.name, role: updated.role },
    action: "account.reactivated", entityType: "user", entityId: updated._id, createdAt: now,
  });
  await notifyAdmins(db, updated._id, "Client reactivated their account", `${updated.name} signed back in and reactivated their account.`, "/admin/clients", now);
  return updated;
}

/* ---------- Daily job ---------- */

/** Deletes deactivated accounts whose date has come, then emails the last reminder to those about to be deleted. */
export async function processDeactivatedAccounts(db: Db, now = new Date()) {
  const { deactivationReminderDays } = await getSystemSettings(db);
  const users = db.collection<UserDocument>(collections.users);
  const waiting = { role: "customer" as const, status: "disabled" as const, deletedAt: { $exists: false } };
  const result = { reminded: 0, deleted: 0 };

  for (const user of await users.find({ ...waiting, "deactivation.deletesAt": { $lte: now } }).toArray()) {
    if (await deleteAccount(db, user, systemActor, now)) result.deleted += 1;
  }

  const remindFrom = new Date(now.getTime() + deactivationReminderDays * dayMs);
  const due = await users.find({
    ...waiting, "deactivation.deletesAt": { $gt: now, $lte: remindFrom }, "deactivation.reminderSentAt": { $exists: false },
  }).toArray();
  for (const user of due) {
    const deactivation = user.deactivation!;
    const marked = await users.updateOne(
      { _id: user._id, "deactivation.at": deactivation.at, "deactivation.reminderSentAt": { $exists: false } },
      { $set: { "deactivation.reminderSentAt": now } },
    );
    if (!marked.modifiedCount) continue;
    queueEmail(accountDeletionReminderEmail(user.email, user.name, longManilaDate(deactivation.deletesAt)));
    result.reminded += 1;
  }
  return result;
}
