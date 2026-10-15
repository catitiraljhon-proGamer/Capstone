import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { collections, type ApprovalDocument, type BlueprintFileDocument, type DesignRequestDocument, type DesignVersionDocument, type EstimateDocument, type InvoiceDocument, type PaymentDocument, type UserDocument } from "@/lib/database/collections";
import { invoiceState, sumMoney, toCentavos } from "@/lib/billing";
import { audit, BillingError, billingTransaction } from "@/lib/server/billing";
import { embeddedImagesSchema } from "@/lib/server/embedded-images";
import { insertNotifications } from "@/lib/server/notifications";
import type { BlueprintFileDto, DesignRequestDto, DesignVersionDto, DesignWorkflow, DesignWorkflowDto } from "@/types/design-requests";
import type { SessionUser } from "@/types/domain";

function requestId(value: string) {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new BillingError("Invalid design request.", 400);
  return new ObjectId(value);
}

function imagesFor(design: DesignRequestDocument) {
  return design.completedDesignImages ?? (design.completedDesignImage ? [design.completedDesignImage] : []);
}

/** Requests delivered under the old flow keep their design-fee rules; everything else follows the blueprint flow. */
export function designWorkflow(design: Pick<DesignRequestDocument, "status">): DesignWorkflow {
  return design.status === "Completed" ? "legacy" : "blueprint";
}

function decodeImage(image: string) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) throw new BillingError("This design image needs to be uploaded again by the admin.", 409);
  return { bytes: Buffer.from(match[2], "base64"), mimeType: match[1] };
}

async function versionDtos(db: Db, designRequestId: ObjectId): Promise<DesignVersionDto[]> {
  const versions = await db.collection<DesignVersionDocument>(collections.designVersions).aggregate<
    Omit<DesignVersionDocument, "images"> & { imageCount: number }
  >([
    { $match: { designRequestId } },
    { $sort: { version: 1 } },
    { $project: { imageCount: { $size: "$images" }, version: 1, adminNote: 1, createdAt: 1, response: 1 } },
  ]).toArray();
  return versions.map((version) => ({
    version: version.version, imageCount: version.imageCount, adminNote: version.adminNote, createdAt: version.createdAt.toISOString(),
    ...(version.response ? { response: { ...version.response, respondedAt: version.response.respondedAt.toISOString() } } : {}),
  }));
}

async function blueprintFileDtos(db: Db, designRequestId: ObjectId): Promise<BlueprintFileDto[]> {
  const files = await db.collection<BlueprintFileDocument>(collections.blueprintFiles)
    .find({ designRequestId }, { projection: { data: 0 } }).sort({ createdAt: 1 }).toArray();
  return files.map((file) => ({ id: file._id.toHexString(), name: file.name, mimeType: file.mimeType, size: file.size, createdAt: file.createdAt.toISOString() }));
}

/** Verified payments against the request's fee invoice; the invoice unlocks the paid files once fully settled. */
async function feeInvoiceState(db: Db, design: DesignRequestDocument) {
  const invoice = await db.collection<InvoiceDocument>(collections.invoices).findOne({
    designRequestId: design._id, customerId: design.customerId,
    status: { $nin: ["Draft", "Ready", "Void"] },
  });
  const payments = invoice ? await db.collection<PaymentDocument>(collections.payments).find({
    invoiceId: invoice._id, customerId: design.customerId, status: { $in: ["Verified", "Pending"] },
  }, { projection: { status: 1, amount: 1 } }).toArray() : [];
  const paid = sumMoney(payments.filter((payment) => payment.status === "Verified").map((payment) => payment.amount));
  const unlocked = Boolean(invoice && Number.isFinite(invoice.amount) && invoice.amount > 0 && toCentavos(paid) >= toCentavos(invoice.amount));
  return {
    unlocked,
    invoice: invoice ? {
      id: invoice._id.toHexString(), number: invoice.invoiceNumber, amount: invoice.amount, paid,
      balance: invoiceState(invoice, paid).balance, pending: payments.filter((payment) => payment.status === "Pending").length,
    } : null,
  };
}

/** Never put image or file contents in list responses. */
export async function customerDesignDto(db: Db, design: DesignRequestDocument): Promise<DesignRequestDto> {
  const workflow = designWorkflow(design);
  const [{ unlocked, invoice }, versions, blueprintFiles] = await Promise.all([
    feeInvoiceState(db, design),
    workflow === "blueprint" ? versionDtos(db, design._id) : [],
    workflow === "blueprint" ? blueprintFileDtos(db, design._id) : [],
  ]);
  const ready = workflow === "legacy" ? design.status === "Completed" : design.status === "Design approved";
  return {
    id: design._id.toHexString(), workflow, floorArea: design.floorArea, bedrooms: design.bedrooms, bathrooms: design.bathrooms,
    selectedDesign: design.selectedDesign,
    rooms: design.rooms, finish: design.finish, notes: design.notes,
    inspirationImages: design.inspirationImages ?? (design.inspirationImage ? [design.inspirationImage] : []),
    ...(design.preferredDate ? { preferredDate: design.preferredDate.toISOString().slice(0, 10) } : {}),
    ...(design.neededBy ? { neededBy: design.neededBy.toISOString().slice(0, 10) } : {}),
    status: design.status, completedAt: design.completedAt?.toISOString(), designApprovedAt: design.designApprovedAt?.toISOString(),
    createdAt: design.createdAt.toISOString(),
    imageCount: imagesFor(design).length, versions, blueprintFiles,
    access: !ready ? "in-progress" : !invoice ? "awaiting-invoice" : unlocked ? "unlocked" : "payment-required",
    invoice,
  };
}

export async function listCustomerDesigns(db: Db, actor: SessionUser) {
  if (actor.role !== "customer") throw new BillingError("Only customers can view their requested designs.", 403);
  const designs = await db.collection<DesignRequestDocument>(collections.designRequests)
    .find({ customerId: requestId(actor.id) }).sort({ createdAt: -1 }).toArray();
  return Promise.all(designs.map((design) => customerDesignDto(db, design)));
}

/** Customers see only their own requests; the admin sees any request. */
async function findVisibleDesign(db: Db, actor: SessionUser, id: string) {
  if (actor.role !== "customer" && actor.role !== "admin") throw new BillingError("You do not have access to this design.", 403);
  const design = await db.collection<DesignRequestDocument>(collections.designRequests).findOne({
    _id: requestId(id), ...(actor.role === "customer" ? { customerId: requestId(actor.id) } : {}),
  });
  if (!design) throw new BillingError("Design request not found.", 404);
  return design;
}

/** Legacy delivered design images, available once the design fee is fully paid. */
export async function getCustomerDesignImage(db: Db, actor: SessionUser, id: string, index: number) {
  if (actor.role !== "customer") throw new BillingError("Only the requesting customer can view this design.", 403);
  const design = await findVisibleDesign(db, actor, id);
  if (designWorkflow(design) !== "legacy" || !(await feeInvoiceState(db, design)).unlocked) {
    throw new BillingError("Full payment must be verified by the Billing Clerk before viewing this design.", 403);
  }
  const image = Number.isInteger(index) && index >= 0 ? imagesFor(design)[index] : undefined;
  if (!image) throw new BillingError("Design image not found.", 404);
  return decodeImage(image);
}

/** A design or floor plan preview image. Customers view these watermarked before any payment. */
export async function getDesignVersionImage(db: Db, actor: SessionUser, id: string, version: number, index: number) {
  const design = await findVisibleDesign(db, actor, id);
  const record = Number.isInteger(version) && version > 0
    ? await db.collection<DesignVersionDocument>(collections.designVersions).findOne({ designRequestId: design._id, version })
    : null;
  const image = record && Number.isInteger(index) && index >= 0 ? record.images[index] : undefined;
  if (!image) throw new BillingError("Design image not found.", 404);
  return decodeImage(image);
}

async function activeUserIds(db: Db, role: UserDocument["role"]) {
  const users = await db.collection<UserDocument>(collections.users).find({ role, status: "active" }, { projection: { _id: 1 } }).toArray();
  return users.map((user) => user._id);
}

const versionSchema = z.object({
  images: embeddedImagesSchema,
  note: z.string().trim().max(1_000).default(""),
}).strict();

/** The admin sends a design and floor plan round for the customer to approve or send back with changes. */
export async function uploadDesignVersion(db: Db, actor: SessionUser, id: string, raw: unknown) {
  if (actor.role !== "admin") throw new BillingError("Only an administrator can upload designs.", 403);
  const input = versionSchema.parse(raw);
  return billingTransaction(db, async (session) => {
    const designs = db.collection<DesignRequestDocument>(collections.designRequests);
    const design = await designs.findOne({ _id: requestId(id) }, { session });
    if (!design) throw new BillingError("Design request not found.", 404);
    if (design.status !== "Approved" && design.status !== "Changes requested") {
      throw new BillingError(design.status === "In customer review"
        ? "The customer is still reviewing the latest design. Wait for their response before sending another version."
        : "Designs can be uploaded only for feasible requests that are in progress or have requested changes.", 409);
    }
    const approval = await db.collection<ApprovalDocument>(collections.approvals).findOne({
      recordType: "Design request", recordId: design._id, customerId: design.customerId, status: "Approved",
    }, { session });
    if (!approval) throw new BillingError("The connected feasibility approval could not be verified.", 409);
    const now = new Date();
    const version = (design.currentVersion ?? 0) + 1;
    await db.collection<DesignVersionDocument>(collections.designVersions).insertOne({
      _id: new ObjectId(), designRequestId: design._id, customerId: design.customerId, version, images: input.images,
      adminNote: input.note, createdBy: requestId(actor.id), createdByName: actor.name, createdAt: now,
    }, { session });
    const updated = await designs.updateOne({ _id: design._id, status: design.status }, { $set: {
      status: "In customer review", currentVersion: version, updatedAt: now,
    } }, { session });
    if (!updated.matchedCount) throw new BillingError("This request changed while you were uploading. Reload it and try again.", 409);
    await insertNotifications(db, [{
      _id: new ObjectId(), userId: design.customerId,
      title: version === 1 ? "Your design and floor plan are ready for review" : `Revised design ready (version ${version})`,
      body: "Open Dream House to review the design and floor plan. Approve it, or request changes for the admin.",
      href: `/customer/dream-house?design=${design._id.toHexString()}`, kind: "design-review", entityId: design._id, createdAt: now,
    }], session);
    await audit(db, session, actor, "design-request.version-uploaded", "design_request", design._id, {
      approvalReference: approval.reference, version, imageCount: input.images.length,
    });
    return { id, status: "In customer review" as const, version };
  });
}

const responseSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approved"), note: z.string().trim().max(1_000).default("") }).strict(),
  z.object({ decision: z.literal("changes"), note: z.string().trim().min(5, "Describe the changes you want (at least 5 characters).").max(1_000) }).strict(),
]);

/** The customer approves the latest design or sends it back with the changes they want. */
export async function respondToDesign(db: Db, actor: SessionUser, id: string, raw: unknown) {
  if (actor.role !== "customer") throw new BillingError("Only the requesting customer can respond to this design.", 403);
  const input = responseSchema.parse(raw);
  return billingTransaction(db, async (session) => {
    const designs = db.collection<DesignRequestDocument>(collections.designRequests);
    const design = await designs.findOne({ _id: requestId(id), customerId: requestId(actor.id) }, { session });
    if (!design) throw new BillingError("Design request not found.", 404);
    if (design.status !== "In customer review" || !design.currentVersion) throw new BillingError("This design is not waiting for your review.", 409);
    const now = new Date();
    const answered = await db.collection<DesignVersionDocument>(collections.designVersions).updateOne(
      { designRequestId: design._id, version: design.currentVersion, response: { $exists: false } },
      { $set: { response: { decision: input.decision, note: input.note, respondedAt: now } } }, { session },
    );
    if (!answered.matchedCount) throw new BillingError("You already responded to this version.", 409);
    const approved = input.decision === "approved";
    await designs.updateOne({ _id: design._id, status: "In customer review" }, { $set: {
      status: approved ? "Design approved" : "Changes requested", ...(approved ? { designApprovedAt: now } : {}), updatedAt: now,
    } }, { session });
    const label = design._id.toHexString().slice(-8).toUpperCase();
    const preview = input.note.length > 140 ? `${input.note.slice(0, 137)}…` : input.note;
    await insertNotifications(db, (await activeUserIds(db, "admin")).map((adminId) => ({
      _id: new ObjectId(), userId: adminId,
      title: approved ? "Design approved by customer" : "Customer requested design changes",
      body: approved
        ? `${actor.name} approved version ${design.currentVersion} of request ${label}. They can now request a construction cost estimate.`
        : `${actor.name} asked for changes to version ${design.currentVersion} of request ${label}: ${preview}`,
      href: "/admin/approvals", kind: approved ? "design-approved" : "design-changes", entityId: design._id, createdAt: now,
    })), session);
    await audit(db, session, actor, approved ? "design-request.design-approved" : "design-request.changes-requested", "design_request", design._id, {
      version: design.currentVersion, ...(input.note ? { note: input.note } : {}),
    });
    return { id, status: approved ? "Design approved" as const : "Changes requested" as const };
  });
}

export const maxBlueprintFileBytes = 3_000_000;
const maxBlueprintFiles = 10;

const blueprintSchema = z.object({
  name: z.string().trim().min(1, "Name the blueprint file.").max(160),
  dataUrl: z.string().max(4_100_000, "Each blueprint file must be 3 MB or smaller."),
}).strict();

function decodeBlueprint(dataUrl: string) {
  const match = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new BillingError("Upload a PDF, JPG, PNG, or WebP blueprint file.");
  const mimeType = match[1] as BlueprintFileDocument["mimeType"];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > maxBlueprintFileBytes) throw new BillingError("Each blueprint file must be 3 MB or smaller.");
  const valid = mimeType === "application/pdf" ? bytes.toString("ascii", 0, 5) === "%PDF-"
    : mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new BillingError("The file content does not match its type. Export the blueprint again and retry.");
  return { mimeType, data: match[2], size: bytes.length };
}

async function lockedForBlueprintChanges(db: Db, design: DesignRequestDocument) {
  if (designWorkflow(design) !== "blueprint" || design.status !== "Design approved") {
    throw new BillingError("Blueprint files can be added after the customer approves the design.", 409);
  }
  if ((await feeInvoiceState(db, design)).unlocked) throw new BillingError("The blueprint fee is already paid, so the files are locked.", 409);
}

/** One file per request keeps each upload under the hosting body limit. */
export async function uploadBlueprintFile(db: Db, actor: SessionUser, id: string, raw: unknown) {
  if (actor.role !== "admin") throw new BillingError("Only an administrator can upload blueprints.", 403);
  const input = blueprintSchema.parse(raw);
  const file = decodeBlueprint(input.dataUrl);
  const design = await findVisibleDesign(db, actor, id);
  await lockedForBlueprintChanges(db, design);
  const files = db.collection<BlueprintFileDocument>(collections.blueprintFiles);
  if (await files.countDocuments({ designRequestId: design._id }) >= maxBlueprintFiles) {
    throw new BillingError(`A blueprint can have at most ${maxBlueprintFiles} files.`, 409);
  }
  const now = new Date();
  const record: BlueprintFileDocument = {
    _id: new ObjectId(), designRequestId: design._id, customerId: design.customerId, name: input.name,
    ...file, createdBy: requestId(actor.id), createdByName: actor.name, createdAt: now,
  };
  const first = !(await files.countDocuments({ designRequestId: design._id }));
  await files.insertOne(record);
  const estimate = first ? await db.collection<EstimateDocument>(collections.estimates).findOne({ designRequestId: design._id, status: "Accepted" }, { projection: { reference: 1 } }) : null;
  await billingTransaction(db, async (session) => {
    if (estimate) {
      await insertNotifications(db, (await activeUserIds(db, "billing-clerk")).map((clerkId) => ({
        _id: new ObjectId(), userId: clerkId, title: "Blueprint ready for billing",
        body: `The blueprint for ${estimate.reference} is uploaded. Set the blueprint fee and issue its invoice.`,
        href: "/billing-clerk/progress-billings", kind: "blueprint-fee", entityId: design._id, createdAt: now,
      })), session);
    }
    await audit(db, session, actor, "design-request.blueprint-uploaded", "design_request", design._id, { fileName: input.name, size: file.size });
  });
  return { id: record._id.toHexString(), name: record.name, mimeType: record.mimeType, size: record.size, createdAt: now.toISOString() } satisfies BlueprintFileDto;
}

export async function deleteBlueprintFile(db: Db, actor: SessionUser, id: string, fileId: string) {
  if (actor.role !== "admin") throw new BillingError("Only an administrator can remove blueprint files.", 403);
  const design = await findVisibleDesign(db, actor, id);
  await lockedForBlueprintChanges(db, design);
  const removed = await db.collection<BlueprintFileDocument>(collections.blueprintFiles).findOneAndDelete({ _id: requestId(fileId), designRequestId: design._id });
  if (!removed) throw new BillingError("Blueprint file not found.", 404);
  await billingTransaction(db, (session) => audit(db, session, actor, "design-request.blueprint-removed", "design_request", design._id, { fileName: removed.name }));
}

/** Customers download the blueprint only after the Billing Clerk verifies full payment. */
export async function getBlueprintFile(db: Db, actor: SessionUser, id: string, fileId: string) {
  const design = await findVisibleDesign(db, actor, id);
  if (actor.role === "customer" && !(await feeInvoiceState(db, design)).unlocked) {
    throw new BillingError("The blueprint unlocks after the Billing Clerk verifies full payment of the blueprint fee.", 403);
  }
  const file = await db.collection<BlueprintFileDocument>(collections.blueprintFiles).findOne({ _id: requestId(fileId), designRequestId: design._id });
  if (!file) throw new BillingError("Blueprint file not found.", 404);
  return { bytes: Buffer.from(file.data, "base64"), mimeType: file.mimeType, name: file.name };
}

/** Everything the admin needs to run the design review loop and blueprint upload for one request. */
export async function getDesignWorkflow(db: Db, actor: SessionUser, id: string): Promise<DesignWorkflowDto> {
  if (actor.role !== "admin") throw new BillingError("Only an administrator can manage design work.", 403);
  const design = await findVisibleDesign(db, actor, id);
  const [versions, blueprintFiles, estimate, fee] = await Promise.all([
    versionDtos(db, design._id),
    blueprintFileDtos(db, design._id),
    db.collection<EstimateDocument>(collections.estimates).findOne({ designRequestId: design._id }, { projection: { reference: 1, status: 1 } }),
    feeInvoiceState(db, design),
  ]);
  return {
    id, status: design.status, workflow: designWorkflow(design), versions, blueprintFiles,
    estimate: estimate ? { id: estimate._id.toHexString(), reference: estimate.reference, status: estimate.status } : null,
    blueprintInvoice: fee.invoice, blueprintPaid: fee.unlocked,
  };
}
