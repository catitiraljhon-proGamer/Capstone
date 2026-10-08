import { ObjectId, MongoServerError, type ClientSession, type Db, type Filter } from "mongodb";
import { z } from "zod";
import { collections, type AuditLogDocument, type DesignRequestDocument, type InvoiceDocument, type NotificationDocument, type PaymentDocument, type ProjectDocument, type ScheduleDocument, type UserDocument } from "@/lib/database/collections";
import { fromCentavos, invoiceState, manilaDate, sumMoney, toCentavos } from "@/lib/billing";
import { milestoneDtos, projectBillingFrom, promoteScheduledProjects } from "@/lib/server/project-milestones";
import { paymentMethods, type BillingData, type BillingReceipt } from "@/types/billing";
import type { SessionUser } from "@/types/domain";

export class BillingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function assertBillingRole(actor: SessionUser, allowCustomer = false) {
  if (actor.role !== "billing-clerk" && !(allowCustomer && actor.role === "customer")) {
    throw new BillingError("Billing and payment management is restricted to the Billing Clerk.", 403);
  }
}

const idSchema = z.string().regex(/^[a-f\d]{24}$/i, "Select a valid record.");
const moneySchema = z.number().finite().positive().max(1_000_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, "Use at most two decimal places.");
export const invoiceInputSchema = z.object({
  projectId: idSchema.optional(),
  designRequestId: idSchema.optional(),
  milestoneId: z.uuid().optional(),
  label: z.string().trim().min(3).max(160),
  basis: z.string().trim().min(5, "Enter the approved accomplishment or contract milestone reference.").max(2000),
  progressPercentage: z.number().min(0).max(100),
  amount: moneySchema,
  dueDate: z.iso.date(),
}).strict().refine((input) => Boolean(input.projectId) !== Boolean(input.designRequestId), "Select either a construction project or a completed design request.");
export const invoiceActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), invoice: invoiceInputSchema }).strict(),
  z.object({ action: z.literal("issue") }).strict(),
  z.object({ action: z.literal("void"), reason: z.string().trim().min(5).max(1000) }).strict(),
  z.object({ action: z.literal("remind") }).strict(),
]);

function validProof(value: string) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 750_000 || bytes.length < 12) return false;
  if (match[1] === "png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (match[1] === "jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export const paymentInputSchema = z.object({
  invoiceId: idSchema,
  amount: moneySchema,
  method: z.enum(paymentMethods),
  transactionReference: z.string().trim().max(120),
  paidAt: z.iso.date().refine((value) => value <= manilaDate(), "Payment date cannot be in the future."),
  notes: z.string().trim().max(1000).optional(),
  proofImage: z.string().max(1_000_100).refine(validProof, "Upload a valid JPG, PNG or WebP image under 750 KB.").optional(),
  submissionKey: z.uuid(),
}).strict().refine((value) => value.method === "Cash" || value.transactionReference.length >= 3, {
  message: "Enter the transaction reference for this payment.", path: ["transactionReference"],
});
export const paymentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify") }).strict(),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(5).max(1000) }).strict(),
  z.object({ action: z.literal("reverse"), reason: z.string().trim().min(5).max(1000) }).strict(),
]);

function recordId(value: string) { return new ObjectId(idSchema.parse(value)); }

/** Shared writes serialize concurrent balance checks inside the transaction. */
export async function billingTransaction<T>(db: Db, work: (session: ClientSession) => Promise<T>) {
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => work(session), {
      readConcern: { level: "snapshot" }, writeConcern: { w: "majority" },
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 20) {
      throw new BillingError("Billing requires MongoDB Atlas or a replica set. For local development, restart MongoDB using npm run db:local.", 503);
    }
    throw error;
  } finally { await session.endSession(); }
}

export async function nextReference(db: Db, session: ClientSession, prefix: string, now: Date) {
  const year = now.getUTCFullYear();
  const sequence = await db.collection<{ _id: string; value: number }>("billing_counters").findOneAndUpdate(
    { _id: `${prefix}-${year}` }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after", session },
  );
  return `${prefix}-${year}-${String(sequence!.value).padStart(6, "0")}`;
}

export async function audit(db: Db, session: ClientSession, actor: SessionUser, action: string, entityType: string, entityId: ObjectId, details: AuditLogDocument["details"] = {}) {
  await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
    _id: new ObjectId(), actorId: recordId(actor.id), actorName: actor.name, actorRole: actor.role,
    action, entityType, entityId, details, createdAt: new Date(),
  }, { session });
}

async function notifyCustomer(db: Db, session: ClientSession, customerId: ObjectId, title: string, body: string, entityId: ObjectId) {
  await db.collection<NotificationDocument>(collections.notifications).insertOne({
    _id: new ObjectId(), userId: customerId, title, body, entityId,
    kind: "billing", href: "/customer/billing", createdAt: new Date(),
  }, { session });
}

async function lockProject(db: Db, session: ClientSession, id: ObjectId) {
  const project = await db.collection<ProjectDocument>(collections.projects).findOneAndUpdate(
    { _id: id }, { $inc: { billingVersion: 1 } }, { session, returnDocument: "after" },
  );
  if (!project) throw new BillingError("Project not found.", 404);
  return project;
}

async function lockInvoice(db: Db, session: ClientSession, id: ObjectId) {
  const invoice = await db.collection<InvoiceDocument>(collections.invoices).findOneAndUpdate(
    { _id: id }, { $inc: { billingVersion: 1 } }, { session, returnDocument: "after" },
  );
  if (!invoice) throw new BillingError("Invoice not found.", 404);
  return invoice;
}

async function paidForInvoice(db: Db, session: ClientSession, id: ObjectId) {
  const payments = await db.collection<PaymentDocument>(collections.payments)
    .find({ invoiceId: id, status: "Verified" }, { session, projection: { amount: 1 } }).toArray();
  return sumMoney(payments.map((payment) => payment.amount));
}

async function validateInvoice(db: Db, session: ClientSession, input: z.infer<typeof invoiceInputSchema>, project: ProjectDocument, exceptId?: ObjectId) {
  if (!["Active", "Completed", "Scheduled", "Awaiting downpayment"].includes(project.status)) throw new BillingError("Select an active, scheduled, or completed project with an agreed contract.");
  if (!Number.isFinite(project.contractPrice) || project.contractPrice <= 0) throw new BillingError("The project needs a valid agreed contract amount before billing.");
  const customer = await db.collection<UserDocument>(collections.users).findOne({
    _id: project.customerId, role: "customer", status: "active", clientArchivedAt: null,
  }, { session });
  if (!customer) throw new BillingError("This project's customer is inactive or archived.");
  const otherInvoices = await db.collection<InvoiceDocument>(collections.invoices).find({
    projectId: project._id, status: { $ne: "Void" }, ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }, { session }).toArray();
  if (project.paymentSchedule?.length) {
    const milestone = input.milestoneId ? project.paymentSchedule.find((item) => item.id === input.milestoneId) : undefined;
    if (!input.milestoneId) throw new BillingError("Select the payment milestone this invoice bills.");
    if (!milestone) throw new BillingError("This payment milestone does not belong to the project.");
    if (project.status === "Awaiting downpayment" && !milestone.isDownpayment) throw new BillingError("Only the downpayment can be billed until it is verified.", 409);
    if (otherInvoices.some((invoice) => invoice.milestoneId === milestone.id)) throw new BillingError("This payment milestone already has an invoice. Open the existing record.", 409);
    if (toCentavos(input.amount) !== toCentavos(milestone.amount)) throw new BillingError("The invoice amount must equal the milestone amount agreed in the accepted estimate.");
  } else {
    if (project.status === "Scheduled" || project.status === "Awaiting downpayment") throw new BillingError("Select an active or completed project with an agreed contract.");
    if (input.milestoneId) throw new BillingError("This project has no payment schedule.");
  }
  if (otherInvoices.some((invoice) => invoice.label.trim().toLowerCase() === input.label.toLowerCase())) {
    throw new BillingError("This billing stage already exists for the project. Open the existing record.", 409);
  }
  if (toCentavos(sumMoney(otherInvoices.map((invoice) => invoice.amount))) + toCentavos(input.amount) > toCentavos(project.contractPrice)) {
    throw new BillingError("This billing would exceed the contract amount, including existing drafts.");
  }
}

async function validateDesignInvoice(db: Db, session: ClientSession, id: ObjectId, exceptId?: ObjectId) {
  const design = await db.collection<DesignRequestDocument>(collections.designRequests).findOneAndUpdate(
    { _id: id }, { $inc: { billingVersion: 1 } }, { session, returnDocument: "after" },
  );
  if (!design || design.status !== "Completed" || !(design.completedDesignImages?.length || design.completedDesignImage)) {
    throw new BillingError("The admin must deliver the completed design before preparing its fee.", 409);
  }
  const customer = await db.collection<UserDocument>(collections.users).findOne({ _id: design.customerId, role: "customer", status: "active", clientArchivedAt: null }, { session });
  if (!customer) throw new BillingError("This customer is inactive or archived.");
  const existing = await db.collection<InvoiceDocument>(collections.invoices).findOne({
    designRequestId: id, status: { $ne: "Void" }, ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }, { session });
  if (existing) throw new BillingError("A fee invoice already exists for this design request. Open the existing invoice.", 409);
  return design;
}

export async function createInvoice(db: Db, actor: SessionUser, raw: unknown) {
  assertBillingRole(actor);
  const input = invoiceInputSchema.parse(raw);
  return billingTransaction(db, async (session) => {
    let customerId: ObjectId;
    if (input.designRequestId) {
      customerId = (await validateDesignInvoice(db, session, recordId(input.designRequestId))).customerId;
    } else {
      const project = await lockProject(db, session, recordId(input.projectId!));
      await validateInvoice(db, session, input, project);
      customerId = project.customerId;
    }
    const now = new Date();
    const invoice: InvoiceDocument = {
      _id: new ObjectId(), invoiceNumber: await nextReference(db, session, "INV", now), customerId,
      ...(input.designRequestId ? { designRequestId: recordId(input.designRequestId) } : { projectId: recordId(input.projectId!), ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}) }),
      label: input.label, basis: input.basis,
      progressPercentage: input.designRequestId ? 0 : input.progressPercentage, amount: input.amount,
      dueDate: new Date(input.dueDate + "T00:00:00.000Z"), status: "Draft", createdAt: now, updatedAt: now,
    };
    await db.collection<InvoiceDocument>(collections.invoices).insertOne(invoice, { session });
    if (invoice.projectId && invoice.milestoneId) {
      await db.collection<ProjectDocument>(collections.projects).updateOne(
        { _id: invoice.projectId, "paymentSchedule.id": invoice.milestoneId }, { $set: { "paymentSchedule.$.invoiceId": invoice._id } }, { session },
      );
    }
    await audit(db, session, actor, "invoice.created", "invoice", invoice._id, { reference: invoice.invoiceNumber, amount: invoice.amount });
    return invoice._id.toHexString();
  });
}

export async function changeInvoice(db: Db, actor: SessionUser, id: string, raw: unknown) {
  assertBillingRole(actor);
  const input = invoiceActionSchema.parse(raw);
  return billingTransaction(db, async (session) => {
    const invoice = await lockInvoice(db, session, recordId(id));
    const project = invoice.projectId ? await lockProject(db, session, invoice.projectId) : null;
    const now = new Date();
    const invoices = db.collection<InvoiceDocument>(collections.invoices);
    if (input.action === "edit") {
      if (!["Draft", "Ready"].includes(invoice.status)) throw new BillingError("Only unreleased invoices can be edited.", 409);
      if (input.invoice.projectId !== invoice.projectId?.toHexString() || input.invoice.designRequestId !== invoice.designRequestId?.toHexString()) throw new BillingError("A billing record cannot be moved to another project or design request.");
      if (input.invoice.milestoneId !== invoice.milestoneId) throw new BillingError("The payment milestone of an invoice cannot be changed.");
      if (invoice.designRequestId) await validateDesignInvoice(db, session, invoice.designRequestId, invoice._id);
      else if (project) await validateInvoice(db, session, input.invoice, project, invoice._id);
      else throw new BillingError("The invoice source is missing.", 409);
      await invoices.updateOne({ _id: invoice._id }, { $set: {
        label: input.invoice.label, basis: input.invoice.basis, progressPercentage: invoice.designRequestId ? 0 : input.invoice.progressPercentage,
        amount: input.invoice.amount, dueDate: new Date(`${input.invoice.dueDate}T00:00:00.000Z`), updatedAt: now,
      } }, { session });
    } else if (input.action === "issue") {
      if (!["Draft", "Ready"].includes(invoice.status)) throw new BillingError("This invoice has already been released or voided.", 409);
      if (invoice.designRequestId) {
        await validateDesignInvoice(db, session, invoice.designRequestId, invoice._id);
        moneySchema.parse(invoice.amount);
      } else if (project) await validateInvoice(db, session, invoiceInputSchema.parse({
        projectId: project._id.toHexString(), ...(invoice.milestoneId ? { milestoneId: invoice.milestoneId } : {}), label: invoice.label, basis: invoice.basis ?? "",
        progressPercentage: invoice.progressPercentage, amount: invoice.amount, dueDate: invoice.dueDate.toISOString().slice(0, 10),
      }), project, invoice._id);
      else throw new BillingError("The invoice source is missing.", 409);
      if (invoice.dueDate.toISOString().slice(0, 10) < manilaDate(now)) throw new BillingError("Update the due date before issuing this invoice.");
      await invoices.updateOne({ _id: invoice._id }, { $set: { status: "Sent", issuedAt: now, issuedBy: recordId(actor.id), updatedAt: now } }, { session });
      await notifyCustomer(db, session, invoice.customerId, "New invoice", `${invoice.invoiceNumber}: ${invoice.label} is ready for payment.`, invoice._id);
    } else if (input.action === "void") {
      if (invoice.status === "Void") throw new BillingError("This invoice is already void.", 409);
      const activePayments = await db.collection<PaymentDocument>(collections.payments).countDocuments({
        invoiceId: invoice._id, status: { $in: ["Pending", "Verified"] },
      }, { session });
      if (activePayments) throw new BillingError("Reject pending payments and reverse verified payments before voiding this invoice.", 409);
      await invoices.updateOne({ _id: invoice._id }, { $set: { status: "Void", voidReason: input.reason, voidedAt: now, updatedAt: now } }, { session });
      if (project && invoice.milestoneId) {
        await db.collection<ProjectDocument>(collections.projects).updateOne(
          { _id: project._id, "paymentSchedule.id": invoice.milestoneId }, { $unset: { "paymentSchedule.$.invoiceId": "" } }, { session },
        );
      }
      if (invoice.issuedAt || !["Draft", "Ready"].includes(invoice.status)) {
        await notifyCustomer(db, session, invoice.customerId, "Invoice voided", `${invoice.invoiceNumber}: ${input.reason}`, invoice._id);
      }
    } else {
      const paid = await paidForInvoice(db, session, invoice._id);
      if (["Draft", "Ready", "Void"].includes(invoice.status) || invoiceState(invoice, paid).balance === 0) throw new BillingError("Only unpaid, issued invoices can receive reminders.");
      if (invoice.lastReminderAt && now.getTime() - invoice.lastReminderAt.getTime() < 86_400_000) throw new BillingError("A reminder was already sent for this invoice in the last 24 hours.", 409);
      await invoices.updateOne({ _id: invoice._id }, { $set: { lastReminderAt: now } }, { session });
      await notifyCustomer(db, session, invoice.customerId, "Payment reminder", `Please review the remaining balance on ${invoice.invoiceNumber}, due ${invoice.dueDate.toISOString().slice(0, 10)}.`, invoice._id);
    }
    await audit(db, session, actor, `invoice.${input.action}`, "invoice", invoice._id, {
      reference: invoice.invoiceNumber, ...("reason" in input ? { reason: input.reason } : {}),
    });
  });
}

export async function submitPayment(db: Db, actor: SessionUser, raw: unknown) {
  assertBillingRole(actor, true);
  const input = paymentInputSchema.parse(raw);
  if (actor.role === "customer" && input.method === "Cash") throw new BillingError("Cash payments must be recorded by the Billing Clerk.");
  return billingTransaction(db, async (session) => {
    const invoice = await lockInvoice(db, session, recordId(input.invoiceId));
    if (actor.role === "customer" && invoice.customerId.toHexString() !== actor.id) throw new BillingError("Invoice not found.", 404);
    const submissionKey = `${actor.id}:${input.submissionKey}`;
    const existing = await db.collection<PaymentDocument>(collections.payments).findOne({ submissionKey }, { session });
    if (existing) {
      if (!existing.invoiceId?.equals(invoice._id) || existing.amount !== input.amount || existing.method !== input.method || existing.transactionReference !== input.transactionReference) {
        throw new BillingError("This submission was already used for a different payment.", 409);
      }
      return existing._id.toHexString();
    }
    if (["Draft", "Ready", "Void"].includes(invoice.status)) throw new BillingError("Payments can only be submitted against issued invoices.");
    const paid = await paidForInvoice(db, session, invoice._id);
    if (toCentavos(input.amount) > toCentavos(invoiceState(invoice, paid).balance)) throw new BillingError("The payment exceeds this invoice's outstanding balance.");
    const now = new Date();
    const payment: PaymentDocument = {
      _id: new ObjectId(), reference: await nextReference(db, session, "PAY", now),
      customerId: invoice.customerId, projectId: invoice.projectId, invoiceId: invoice._id,
      amount: input.amount, method: input.method, status: "Pending", paidAt: new Date(`${input.paidAt}T04:00:00.000Z`), createdAt: now,
      transactionReference: input.transactionReference, submissionKey,
      ...(input.method !== "Cash" ? { duplicateKey: `${input.method}:${input.transactionReference.toLowerCase()}` } : {}),
      ...(input.proofImage ? { proofImage: input.proofImage } : {}), ...(input.notes ? { notes: input.notes } : {}),
    };
    await db.collection<PaymentDocument>(collections.payments).insertOne(payment, { session });
    await audit(db, session, actor, "payment.submitted", "payment", payment._id, { reference: payment.reference, amount: payment.amount });
    return payment._id.toHexString();
  });
}

/** Keeps the "Payment due" calendar event and the project status in step with a milestone's payments. */
async function syncMilestoneProject(db: Db, session: ClientSession, invoice: InvoiceDocument, updatedPaid: number, action: "verify" | "reverse", now: Date) {
  const projects = db.collection<ProjectDocument>(collections.projects);
  const project = await projects.findOne({ _id: invoice.projectId! }, { session });
  const milestone = project?.paymentSchedule?.find((item) => item.id === invoice.milestoneId);
  if (!project || !milestone) return;
  const fullyPaid = toCentavos(updatedPaid) >= toCentavos(invoice.amount);
  await db.collection<ScheduleDocument>(collections.schedules).updateMany(
    { projectId: project._id, milestoneId: milestone.id, eventType: "Payment due", paymentStatus: fullyPaid ? { $in: ["Expected", "Pending", "Overdue"] } : "Paid" },
    { $set: { paymentStatus: fullyPaid ? "Paid" : "Expected", updatedAt: now } }, { session },
  );
  if (!milestone.isDownpayment) return;
  const notifications = db.collection<NotificationDocument>(collections.notifications);
  if (action === "verify" && fullyPaid && project.status === "Awaiting downpayment") {
    const startDate = project.startDate?.toISOString().slice(0, 10);
    const scheduled = Boolean(startDate && startDate > manilaDate(now));
    const status = scheduled ? "Scheduled" : "Active";
    const moved = await projects.updateOne({ _id: project._id, status: "Awaiting downpayment" }, { $set: { status, updatedAt: now } }, { session });
    if (!moved.modifiedCount) return;
    const admins = await db.collection<UserDocument>(collections.users).find({ role: "admin", status: "active" }, { session, projection: { _id: 1 } }).toArray();
    await notifications.insertMany([
      {
        _id: new ObjectId(), userId: project.customerId,
        title: scheduled ? "Downpayment verified — your project is scheduled" : "Downpayment verified — your project is active",
        body: scheduled ? `${project.name} is scheduled to start on ${startDate}.` : `${project.name} is now active.`,
        href: "/customer/project", kind: "construction-project", entityId: project._id, createdAt: now,
      },
      ...admins.map((admin) => ({
        _id: new ObjectId(), userId: admin._id, title: "Downpayment verified",
        body: `${project.reference} · ${project.name} is now ${status.toLowerCase()}.`,
        href: "/admin/projects", kind: "construction-project", entityId: project._id, createdAt: now,
      })),
    ], { session });
  } else if (action === "reverse" && !fullyPaid && project.status === "Scheduled") {
    await projects.updateOne({ _id: project._id, status: "Scheduled" }, { $set: { status: "Awaiting downpayment", updatedAt: now } }, { session });
    await notifications.insertOne({
      _id: new ObjectId(), userId: project.customerId, title: "Downpayment payment reversed",
      body: `A downpayment payment for ${project.name} was reversed. Settle the downpayment to keep your project schedule.`,
      href: "/customer/project", kind: "construction-project", entityId: project._id, createdAt: now,
    }, { session });
  }
}

export async function reviewPayment(db: Db, actor: SessionUser, id: string, raw: unknown) {
  assertBillingRole(actor);
  const input = paymentActionSchema.parse(raw);
  return billingTransaction(db, async (session) => {
    const payments = db.collection<PaymentDocument>(collections.payments);
    const payment = await payments.findOne({ _id: recordId(id) }, { session });
    if (!payment) throw new BillingError("Payment not found.", 404);
    if (!payment.invoiceId) throw new BillingError("This legacy payment has no invoice link. Reconcile the record before changing it.", 409);
    const invoice = await lockInvoice(db, session, payment.invoiceId);
    if (!payment.customerId.equals(invoice.customerId) || payment.projectId?.toHexString() !== invoice.projectId?.toHexString()) throw new BillingError("The payment and invoice do not match.", 409);
    const now = new Date();
    const paid = await paidForInvoice(db, session, invoice._id);
    let updatedPaid = paid;
    if (input.action === "verify") {
      if (payment.status !== "Pending") throw new BillingError("Only pending payments can be verified.", 409);
      moneySchema.parse(payment.amount);
      if (["Draft", "Ready", "Void"].includes(invoice.status)) throw new BillingError("The linked invoice is not payable.", 409);
      if (toCentavos(payment.amount) > toCentavos(invoiceState(invoice, paid).balance)) throw new BillingError("This payment exceeds the current balance. Review it before verification.", 409);
      const customer = await db.collection<UserDocument>(collections.users).findOne({ _id: invoice.customerId }, { session });
      const project = invoice.projectId ? await db.collection<ProjectDocument>(collections.projects).findOne({ _id: invoice.projectId }, { session }) : null;
      if (!customer || (!project && !invoice.designRequestId)) throw new BillingError("The linked customer or project is missing.", 409);
      updatedPaid = sumMoney([paid, payment.amount]);
      await payments.updateOne({ _id: payment._id, status: "Pending" }, { $set: {
        status: "Verified", verifiedAt: now, verifiedBy: recordId(actor.id), reviewedAt: now, reviewedByName: actor.name,
        receipt: {
          number: await nextReference(db, session, "RCT", now), customerName: customer.name, projectName: invoice.designRequestId ? `Design request ${invoice.designRequestId.toHexString().slice(-8).toUpperCase()}` : `${project!.reference} · ${project!.name}`,
          invoiceNumber: invoice.invoiceNumber, invoiceLabel: invoice.label, invoiceAmount: invoice.amount,
          amount: payment.amount, balanceAfterPayment: fromCentavos(toCentavos(invoice.amount) - toCentavos(updatedPaid)),
          method: payment.method, transactionReference: payment.transactionReference || payment.reference,
          paidAt: payment.paidAt.toISOString(), issuedAt: now.toISOString(), verifiedByName: actor.name,
        },
      } }, { session });
    } else if (input.action === "reject") {
      if (payment.status !== "Pending") throw new BillingError("Only pending payments can be rejected.", 409);
      await payments.updateOne({ _id: payment._id }, { $set: {
        status: "Rejected", reviewNote: input.reason, reviewedAt: now, reviewedByName: actor.name,
      }, $unset: { duplicateKey: "" } }, { session });
    } else {
      if (payment.status !== "Verified") throw new BillingError("Only verified payments can be reversed.", 409);
      updatedPaid = fromCentavos(toCentavos(paid) - toCentavos(payment.amount));
      await payments.updateOne({ _id: payment._id }, { $set: {
        status: "Reversed", reversedAt: now, reversedByName: actor.name, reversalReason: input.reason,
      }, $unset: { duplicateKey: "" } }, { session });
    }
    await db.collection<InvoiceDocument>(collections.invoices).updateOne({ _id: invoice._id }, {
      $set: { status: invoiceState(invoice, updatedPaid, now).status, updatedAt: now },
    }, { session });
    if (invoice.designRequestId && (input.action === "verify" || input.action === "reverse")) {
      const unlocked = toCentavos(updatedPaid) >= toCentavos(invoice.amount);
      if (unlocked || input.action === "reverse") await db.collection<NotificationDocument>(collections.notifications).insertOne({
        _id: new ObjectId(), userId: invoice.customerId,
        title: unlocked ? "Your house design is unlocked" : "Design access requires payment",
        body: unlocked ? "Full payment of your design fee was verified. Open My House Design to view and download your completed images." : "A design payment was reversed. Settle the remaining design fee to restore viewing access.",
        href: "/customer/house-design", kind: "design-access", entityId: invoice.designRequestId, createdAt: now,
      }, { session });
    }
    if (invoice.projectId && invoice.milestoneId && (input.action === "verify" || input.action === "reverse")) {
      await syncMilestoneProject(db, session, invoice, updatedPaid, input.action, now);
    }
    await audit(db, session, actor, `payment.${input.action}`, "payment", payment._id, {
      reference: payment.reference, amount: payment.amount, ...("reason" in input ? { reason: input.reason } : {}),
    });
    await notifyCustomer(db, session, payment.customerId,
      input.action === "verify" ? "Payment verified — receipt available" : input.action === "reject" ? "Payment rejected" : "Payment reversed",
      `${payment.reference} for ${invoice.invoiceNumber}.${"reason" in input ? ` ${input.reason}` : " Your receipt is available in Billing."}`, payment._id);
  });
}

export async function getBillingData(db: Db, actor: SessionUser): Promise<BillingData> {
  assertBillingRole(actor, true);
  const clerk = actor.role === "billing-clerk";
  const owner = clerk ? {} : { customerId: recordId(actor.id) };
  await promoteScheduledProjects(db);
  const invoiceFilter: Filter<InvoiceDocument> = clerk ? {} : {
    ...owner, status: { $nin: ["Draft", "Ready"] },
    $or: [{ status: { $ne: "Void" } }, { issuedAt: { $exists: true } }],
  };
  const [projects, invoices, payments, users, activity, designs] = await Promise.all([
    db.collection<ProjectDocument>(collections.projects).find(owner).sort({ createdAt: -1 }).toArray(),
    db.collection<InvoiceDocument>(collections.invoices).find(invoiceFilter).sort({ createdAt: -1 }).toArray(),
    db.collection<PaymentDocument>(collections.payments).find(owner, { projection: { proofImage: 0 } }).sort({ createdAt: -1 }).toArray(),
    db.collection<UserDocument>(collections.users).find(clerk ? { role: "customer" } : { _id: recordId(actor.id) }, { projection: { name: 1 } }).toArray(),
    clerk ? db.collection<AuditLogDocument>(collections.auditLogs).find({ entityType: { $in: ["invoice", "payment"] } }).sort({ createdAt: -1 }).limit(12).toArray() : [],
    clerk ? db.collection<DesignRequestDocument>(collections.designRequests).find({ status: "Completed" }, { projection: { customerId: 1, floorArea: 1, finish: 1 } }).sort({ completedAt: -1 }).toArray() : [],
  ]);
  const billing = projectBillingFrom(invoices, payments);
  const customerNames = new Map(users.map((user) => [user._id.toHexString(), user.name]));
  const projectNames = new Map(projects.map((project) => [project._id.toHexString(), `${project.reference} · ${project.name}`]));
  const invoiceNumbers = new Map(invoices.map((invoice) => [invoice._id.toHexString(), invoice.invoiceNumber]));
  const proofIds = new Set((await db.collection<PaymentDocument>(collections.payments)
    .find({ ...owner, proofImage: { $exists: true } }, { projection: { _id: 1 } }).toArray()).map((payment) => payment._id.toHexString()));
  const invoiceDtos = invoices.map((invoice) => {
    const paid = sumMoney(payments.filter((payment) => payment.status === "Verified" && payment.invoiceId?.equals(invoice._id)).map((payment) => payment.amount));
    return {
      id: invoice._id.toHexString(), invoiceNumber: invoice.invoiceNumber, projectId: invoice.projectId?.toHexString() ?? "", designRequestId: invoice.designRequestId?.toHexString(), milestoneId: invoice.milestoneId,
      customerId: invoice.customerId.toHexString(), customerName: customerNames.get(invoice.customerId.toHexString()) ?? "Unknown customer",
      projectName: invoice.designRequestId ? `Design request ${invoice.designRequestId.toHexString().slice(-8).toUpperCase()}` : projectNames.get(invoice.projectId?.toHexString() ?? "") ?? "Unknown project",
      label: invoice.label, basis: invoice.basis ?? "", progressPercentage: invoice.progressPercentage,
      amount: invoice.amount, paid, ...invoiceState(invoice, paid),
      dueDate: invoice.dueDate.toISOString().slice(0, 10), issuedAt: invoice.issuedAt?.toISOString(), voidReason: invoice.voidReason,
    };
  });
  return {
    designRequests: designs.map((design) => ({ id: design._id.toHexString(), customerName: customerNames.get(design.customerId.toHexString()) ?? "Unknown customer", label: design.floorArea + " sqm · " + design.finish + " · " + design._id.toHexString().slice(-8).toUpperCase(), invoiceId: invoices.find((invoice) => invoice.designRequestId?.equals(design._id) && invoice.status !== "Void")?._id.toHexString() })),
    projects: projects.map((project) => {
      const projectInvoices = invoiceDtos.filter((invoice) => invoice.projectId === project._id.toHexString() && invoice.status !== "Void");
      const issued = projectInvoices.filter((invoice) => !["Draft", "Ready"].includes(invoice.status));
      return {
        id: project._id.toHexString(), reference: project.reference, name: project.name, status: project.status,
        customerId: project.customerId.toHexString(), customerName: customerNames.get(project.customerId.toHexString()) ?? "Unknown customer",
        contractPrice: project.contractPrice, allocated: sumMoney(projectInvoices.map((invoice) => invoice.amount)),
        billed: sumMoney(issued.map((invoice) => invoice.amount)),
        paid: sumMoney(payments.filter((payment) => payment.status === "Verified" && payment.projectId?.equals(project._id)).map((payment) => payment.amount)),
        outstanding: sumMoney(issued.map((invoice) => invoice.balance)),
        milestones: milestoneDtos(project, billing, !clerk),
      };
    }),
    invoices: invoiceDtos,
    payments: payments.map((payment) => ({
      id: payment._id.toHexString(), reference: payment.reference, invoiceId: payment.invoiceId?.toHexString() ?? null,
      invoiceNumber: payment.invoiceId ? invoiceNumbers.get(payment.invoiceId.toHexString()) ?? "Unavailable invoice" : "Legacy / unallocated",
      customerId: payment.customerId.toHexString(), customerName: customerNames.get(payment.customerId.toHexString()) ?? "Unknown customer",
      projectId: payment.projectId?.toHexString() ?? "", projectName: invoiceDtos.find((invoice) => invoice.id === payment.invoiceId?.toHexString())?.projectName ?? projectNames.get(payment.projectId?.toHexString() ?? "") ?? "Unknown project",
      amount: payment.amount, method: payment.method, status: payment.status, paidAt: payment.paidAt.toISOString(),
      transactionReference: payment.transactionReference ?? "", notes: payment.notes ?? "", hasProof: proofIds.has(payment._id.toHexString()),
      reviewNote: payment.reviewNote, receiptNumber: payment.receipt?.number, reversalReason: payment.reversalReason,
    })),
    activity: activity.map((item) => ({ id: item._id.toHexString(), action: item.action, actorName: item.actorName, date: item.createdAt.toISOString() })),
  };
}

export async function getOwnedPayment(db: Db, actor: SessionUser, id: string) {
  assertBillingRole(actor, true);
  const payment = await db.collection<PaymentDocument>(collections.payments).findOne({
    _id: recordId(id), ...(actor.role === "customer" ? { customerId: recordId(actor.id) } : {}),
  });
  if (!payment) throw new BillingError("Payment not found.", 404);
  return payment;
}

export async function getReceipt(db: Db, actor: SessionUser, id: string): Promise<BillingReceipt> {
  const payment = await getOwnedPayment(db, actor, id);
  if (!payment.receipt || (payment.status !== "Verified" && payment.status !== "Reversed")) throw new BillingError("No receipt is available for this payment.", 404);
  return { receipt: payment.receipt, status: payment.status, reversalReason: payment.reversalReason, reversedAt: payment.reversedAt?.toISOString() };
}
