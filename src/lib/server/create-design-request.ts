import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import {
  collections,
  type ApprovalDocument,
  type DesignRequestDocument,
  type HouseDesignDocument,
  type NotificationDocument,
  type ProjectDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { manilaDate } from "@/lib/billing";
import { recordAuditLog } from "@/lib/server/audit";
import { makePendingApproval } from "@/lib/server/approvals";
import { BillingError } from "@/lib/server/billing";
import { requireDesignRequestTerms } from "@/lib/server/design-request-terms";
import { customerDesignDto } from "@/lib/server/design-requests";
import { embeddedImageSchema, embeddedImagesSchema } from "@/lib/server/embedded-images";
import type { SessionUser } from "@/types/domain";

const termsAcceptanceId = z.string().regex(
  /^[a-f\d]{24}$/i,
  "Accept the Design Request Terms and Conditions first.",
);

const preferredDate = z.iso.date("Choose a Preferred Date after today.");
const neededBy = z.iso.date("Choose a Needed By date after today.");

const inputSchema = z.union([
  z.object({
    houseDesignId: z.string().regex(/^[a-f\d]{24}$/i, "Select an available house design."),
    notes: z.string().trim().max(4_000).default(""),
    inspirationImages: z.array(embeddedImageSchema).max(6).default([]),
    preferredDate,
    neededBy,
    termsAcceptanceId,
  }).strict(),
  z.object({
    floorArea: z.number().finite().positive().max(100_000),
    bedrooms: z.number().int().nonnegative(),
    bathrooms: z.number().int().nonnegative(),
    finish: z.enum(["Standard", "Semi-luxury", "Luxury"]),
    notes: z.string().trim().min(1).max(4_000),
    inspirationImages: embeddedImagesSchema,
    preferredDate,
    neededBy,
    termsAcceptanceId,
  }).strict(),
]);

export async function createDesignRequest(db: Db, actor: SessionUser, raw: unknown) {
  if (actor.role !== "customer") {
    throw new BillingError("Only customers can submit design requests.", 403);
  }
  const input = inputSchema.parse(raw);
  const today = manilaDate();
  if (input.preferredDate <= today) throw new BillingError("Choose a Preferred Date after today.", 400);
  if (input.neededBy <= today) throw new BillingError("Choose a Needed By date after today.", 400);
  if (input.neededBy < input.preferredDate) {
    throw new BillingError("The Needed By date must be on or after the Preferred Date.", 400);
  }
  const termsAcceptance = await requireDesignRequestTerms(db, actor, input.termsAcceptanceId);
  const customerId = new ObjectId(actor.id);
  let details: Pick<DesignRequestDocument,
    "floorArea" | "rooms" | "finish" | "notes" | "bedrooms" | "bathrooms" | "houseDesignId" | "projectId" | "selectedDesign"
  >;

  if ("houseDesignId" in input) {
    const design = await db.collection<HouseDesignDocument>(collections.houseDesigns).findOne({
      _id: new ObjectId(input.houseDesignId), status: "Published",
    });
    if (!design) {
      throw new BillingError("This design is no longer available. Choose another design from Finished Designs.", 404);
    }
    details = {
      houseDesignId: design._id,
      selectedDesign: {
        id: design._id.toHexString(), name: design.name, houseType: design.houseType,
        floorArea: design.area, rooms: design.rooms, finish: design.finish,
      },
      floorArea: design.area, rooms: design.rooms, finish: design.finish,
      notes: input.notes || "I would like to request this design as shown.",
    };
  } else {
    const project = await db.collection<ProjectDocument>(collections.projects).findOne(
      { customerId, status: { $in: ["Awaiting downpayment", "Scheduled", "Pending", "Active", "On hold"] } },
      { sort: { createdAt: -1 } },
    );
    details = {
      projectId: project?._id, houseDesignId: project?.houseDesignId,
      floorArea: input.floorArea, bedrooms: input.bedrooms, bathrooms: input.bathrooms,
      rooms: `${input.bedrooms} bedroom${input.bedrooms === 1 ? "" : "s"}, ${input.bathrooms} bathroom${input.bathrooms === 1 ? "" : "s"}`,
      finish: input.finish, notes: input.notes,
    };
  }

  const now = new Date();
  const document: DesignRequestDocument = {
    _id: new ObjectId(), customerId, ...details, termsAcceptance,
    inspirationImages: input.inspirationImages,
    preferredDate: new Date(`${input.preferredDate}T00:00:00.000Z`),
    neededBy: new Date(`${input.neededBy}T00:00:00.000Z`),
    status: "Pending", createdAt: now, updatedAt: now,
  };
  await db.collection<DesignRequestDocument>(collections.designRequests).insertOne(document);
  await db.collection<ApprovalDocument>(collections.approvals).insertOne(makePendingApproval({
    customerId, recordType: "Design request", recordId: document._id, createdAt: now,
  }));

  const admins = await db.collection<UserDocument>(collections.users)
    .find({ role: "admin", status: "active" }, { projection: { _id: 1 } }).toArray();
  const subject = document.selectedDesign
    ? `requested ${document.selectedDesign.name}`
    : `submitted a ${document.finish.toLowerCase()} design request for ${document.floorArea.toLocaleString("en-PH")} sq m`;
  if (admins.length) {
    await db.collection<NotificationDocument>(collections.notifications).insertMany(admins.map((admin) => ({
      _id: new ObjectId(), userId: admin._id, title: "New design request",
      body: `${actor.name} ${subject}: ${document.notes.length > 120 ? `${document.notes.slice(0, 117)}…` : document.notes} (Needed by ${input.neededBy})`,
      href: "/admin/approvals", kind: "design-request", entityId: document._id, createdAt: now,
    })));
  }
  await recordAuditLog({
    db, actor, action: "design-request.created", entityType: "design_request", entityId: document._id,
    details: {
      floorArea: document.floorArea, finish: document.finish, status: document.status,
      inspirationImageCount: input.inspirationImages.length,
      preferredDate: input.preferredDate, neededBy: input.neededBy,
      ...(document.selectedDesign ? { selectedHouseDesignId: document.selectedDesign.id } : {}),
      termsVersion: termsAcceptance.version,
      termsAcceptedAt: termsAcceptance.acceptedAt.toISOString(),
      termsAcceptanceId: termsAcceptance.auditLogId.toHexString(),
    },
    createdAt: now,
  });
  return customerDesignDto(db, document);
}
