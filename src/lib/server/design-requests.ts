import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { collections, type ApprovalDocument, type AuditLogDocument, type DesignRequestDocument, type InvoiceDocument, type NotificationDocument, type PaymentDocument, type UserDocument } from "@/lib/database/collections";
import { invoiceState, sumMoney, toCentavos } from "@/lib/billing";
import { BillingError, billingTransaction } from "@/lib/server/billing";
import { embeddedImagesSchema } from "@/lib/server/embedded-images";
import type { DesignRequestDto } from "@/types/design-requests";
import type { SessionUser } from "@/types/domain";

function requestId(value: string) {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new BillingError("Invalid design request.", 400);
  return new ObjectId(value);
}

function imagesFor(design: DesignRequestDocument) {
  return design.completedDesignImages ?? (design.completedDesignImage ? [design.completedDesignImage] : []);
}

/** Never put delivered images in list responses, even for a paid request. */
export async function customerDesignDto(db: Db, design: DesignRequestDocument): Promise<DesignRequestDto> {
  const invoice = await db.collection<InvoiceDocument>(collections.invoices).findOne({
    designRequestId: design._id, customerId: design.customerId,
    status: { $nin: ["Draft", "Ready", "Void"] },
  });
  const payments = invoice ? await db.collection<PaymentDocument>(collections.payments).find({
    invoiceId: invoice._id, customerId: design.customerId, status: { $in: ["Verified", "Pending"] },
  }, { projection: { status: 1, amount: 1 } }).toArray() : [];
  const paid = sumMoney(payments.filter((payment) => payment.status === "Verified").map((payment) => payment.amount));
  const balance = invoice ? invoiceState(invoice, paid).balance : 0;
  const unlocked = Boolean(invoice && Number.isFinite(invoice.amount) && invoice.amount > 0 && toCentavos(paid) >= toCentavos(invoice.amount));
  return {
    id: design._id.toHexString(), floorArea: design.floorArea, bedrooms: design.bedrooms, bathrooms: design.bathrooms,
    selectedDesign: design.selectedDesign,
    rooms: design.rooms, finish: design.finish, notes: design.notes,
    inspirationImages: design.inspirationImages ?? (design.inspirationImage ? [design.inspirationImage] : []),
    ...(design.preferredDate ? { preferredDate: design.preferredDate.toISOString().slice(0, 10) } : {}),
    ...(design.neededBy ? { neededBy: design.neededBy.toISOString().slice(0, 10) } : {}),
    status: design.status, completedAt: design.completedAt?.toISOString(), createdAt: design.createdAt.toISOString(),
    imageCount: imagesFor(design).length,
    access: design.status !== "Completed" ? "in-progress" : !invoice ? "awaiting-invoice" : unlocked ? "unlocked" : "payment-required",
    invoice: invoice ? { id: invoice._id.toHexString(), number: invoice.invoiceNumber, amount: invoice.amount, paid, balance, pending: payments.filter((payment) => payment.status === "Pending").length } : null,
  };
}

export async function listCustomerDesigns(db: Db, actor: SessionUser) {
  if (actor.role !== "customer") throw new BillingError("Only customers can view their requested designs.", 403);
  const designs = await db.collection<DesignRequestDocument>(collections.designRequests)
    .find({ customerId: requestId(actor.id) }).sort({ createdAt: -1 }).toArray();
  return Promise.all(designs.map((design) => customerDesignDto(db, design)));
}

export async function getCustomerDesignImage(db: Db, actor: SessionUser, id: string, index: number) {
  if (actor.role !== "customer") throw new BillingError("Only the requesting customer can view this design.", 403);
  const design = await db.collection<DesignRequestDocument>(collections.designRequests).findOne({
    _id: requestId(id), customerId: requestId(actor.id),
  });
  if (!design) throw new BillingError("Design request not found.", 404);
  const dto = await customerDesignDto(db, design);
  if (dto.access !== "unlocked") throw new BillingError("Full payment must be verified by the Billing Clerk before viewing this design.", 403);
  const image = Number.isInteger(index) && index >= 0 ? imagesFor(design)[index] : undefined;
  if (!image) throw new BillingError("Design image not found.", 404);
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) throw new BillingError("This design image needs to be uploaded again by the admin.", 409);
  return { bytes: Buffer.from(match[2], "base64"), mimeType: match[1] };
}

const deliverySchema = z.object({ images: embeddedImagesSchema }).strict();

export async function deliverDesign(db: Db, actor: SessionUser, id: string, raw: unknown) {
  if (actor.role !== "admin") throw new BillingError("Only an administrator can deliver designs.", 403);
  const input = deliverySchema.parse(raw);
  return billingTransaction(db, async (session) => {
    const designs = db.collection<DesignRequestDocument>(collections.designRequests);
    const design = await designs.findOne({ _id: requestId(id) }, { session });
    if (!design) throw new BillingError("Design request not found.", 404);
    if (design.status !== "Approved") throw new BillingError("Approve the request before delivery. Completed designs cannot be replaced.", 409);
    const approval = await db.collection<ApprovalDocument>(collections.approvals).findOne({
      recordType: "Design request", recordId: design._id, customerId: design.customerId, status: "Approved",
    }, { session });
    if (!approval) throw new BillingError("The connected feasibility approval could not be verified.", 409);
    const now = new Date();
    await designs.updateOne({ _id: design._id, status: "Approved" }, { $set: {
      completedDesignImages: input.images, status: "Completed", completedAt: now,
      completedBy: requestId(actor.id), completedByName: actor.name, updatedAt: now,
    } }, { session });
    await db.collection<NotificationDocument>(collections.notifications).insertOne({
      _id: new ObjectId(), userId: design.customerId, title: "Your requested design is ready",
      body: "Your finished design is in My House Design. The Billing Clerk will issue the design fee; viewing and downloading unlock after full payment is verified.",
      href: "/customer/house-design", kind: "design-request-completed", entityId: design._id, createdAt: now,
    }, { session });
    const clerks = await db.collection<UserDocument>(collections.users).find({ role: "billing-clerk", status: "active" }, { session, projection: { _id: 1 } }).toArray();
    if (clerks.length) await db.collection<NotificationDocument>(collections.notifications).insertMany(clerks.map((clerk) => ({
      _id: new ObjectId(), userId: clerk._id, title: "Design fee ready for billing",
      body: approval.reference + " has been completed. Prepare the agreed design fee invoice.",
      href: "/billing-clerk/progress-billings", kind: "design-fee", entityId: design._id, createdAt: now,
    })), { session });
    await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
      _id: new ObjectId(), actorId: requestId(actor.id), actorName: actor.name, actorRole: actor.role,
      action: "design-request.completed", entityType: "design_request", entityId: design._id,
      details: { approvalReference: approval.reference, deliveredImageCount: input.images.length }, createdAt: now,
    }, { session });
    return { id, status: "Completed" as const, completedAt: now.toISOString() };
  });
}
