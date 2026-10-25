import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import {
  collections,
  type ApprovalDocument,
  type DesignRequestDocument,
  type ScheduleDocument,
  type SiteInspectionDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { designRequestName, designRequestSubject } from "@/lib/design-request-subject";
import { lotFacings, maxSitePhotos, toSiteInspectionDto } from "@/lib/site-inspection";
import { audit, BillingError, billingTransaction } from "@/lib/server/billing";
import { embeddedImageSchema } from "@/lib/server/embedded-images";
import { insertNotifications } from "@/lib/server/notifications";
import { addressDetailsSchema, formatAddress } from "@/lib/server/ph-address";
import { assertMeetingSlotFree, formatScheduleDate } from "@/lib/server/schedules";
import type { SessionUser } from "@/types/domain";

const scheduleSchema = z.object({
  scheduledFor: z.iso.datetime({ error: "Choose the inspection date and time." }),
  durationMinutes: z.number().int().min(30, "Allow at least 30 minutes.").max(480, "Keep the inspection within 8 hours.").default(60),
  /** Needed for requests sent before the lot address was asked; otherwise it corrects the saved address. */
  lotAddress: addressDetailsSchema.optional(),
}).strict();

const meters = (label: string) => z.number({ error: `Enter the ${label} in meters.` }).finite()
  .positive(`The ${label} must be more than 0 meters.`).max(10_000, `Check the ${label}.`);
const measurements = {
  lotArea: z.number({ error: "Enter the lot area in sqm." }).finite().positive("The lot area must be more than 0 sqm.").max(1_000_000, "Check the lot area."),
  frontage: meters("frontage"),
  depth: meters("depth"),
  facing: z.enum(lotFacings, { error: "Choose which side faces the road." }),
};
const photos = z.array(embeddedImageSchema).max(maxSitePhotos, `Attach up to ${maxSitePhotos} photos.`).default([]);

const recordSchema = z.discriminatedUnion("result", [
  z.object({
    result: z.literal("Approved"),
    ...measurements,
    notes: z.string().trim().max(1_000, "Keep the notes under 1,000 characters.").default(""),
    photos,
  }).strict(),
  z.object({
    result: z.literal("Not suitable"),
    lotArea: measurements.lotArea.optional(),
    frontage: measurements.frontage.optional(),
    depth: measurements.depth.optional(),
    facing: measurements.facing.optional(),
    reason: z.string().trim().min(5, "Explain why the site is not suitable.").max(1_000, "Keep the reason under 1,000 characters."),
    photos,
  }).strict(),
], { error: "Choose whether the site is approved or not suitable." });

function designId(value: string) {
  if (!/^[a-f\d]{24}$/i.test(value)) throw new BillingError("Invalid design request.", 400);
  return new ObjectId(value);
}

function requireAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new BillingError("Only the admin manages site inspections.", 403);
}

/**
 * Books the visit to the customer's lot as a client meeting at the lot address and tells the customer. Calling it
 * again before the result is recorded moves the visit.
 */
export async function scheduleSiteInspection(db: Db, actor: SessionUser, rawId: string, raw: unknown, now = new Date()) {
  requireAdmin(actor);
  const input = scheduleSchema.parse(raw);
  const scheduledFor = new Date(input.scheduledFor);
  if (scheduledFor.getTime() <= now.getTime()) throw new BillingError("Choose an inspection time in the future.", 400);
  const id = designId(rawId);
  return billingTransaction(db, async (session) => {
    const requests = db.collection<DesignRequestDocument>(collections.designRequests);
    const design = await requests.findOne({ _id: id }, { session });
    if (!design) throw new BillingError("Design request not found.", 404);
    if (!["Pending", "In review"].includes(design.status)) throw new BillingError("Only requests waiting for review need a site inspection.", 409);
    const previous = design.siteInspection;
    if (previous && previous.status !== "Scheduled") throw new BillingError("This site was already inspected.", 409);
    const lotAddressDetails = input.lotAddress ?? design.lotAddressDetails;
    if (!lotAddressDetails) throw new BillingError("Enter the lot address before scheduling the inspection.", 400);
    const lotAddress = formatAddress(lotAddressDetails);
    const customer = await db.collection<UserDocument>(collections.users).findOne({ _id: design.customerId }, { session, projection: { name: 1 } });
    if (!customer) throw new BillingError("The customer for this request was not found.", 404);

    const schedules = db.collection<ScheduleDocument>(collections.schedules);
    // Moving the visit frees its old slot first, so it never clashes with itself.
    if (previous) await schedules.updateOne({ _id: previous.scheduleId }, { $set: { status: "Cancelled", updatedAt: now } }, { session });
    await assertMeetingSlotFree(db, scheduledFor, input.durationMinutes, session);
    const visit: ScheduleDocument = {
      _id: new ObjectId(), title: `Site inspection — ${designRequestSubject(design)}`, eventType: "Client meeting",
      clientId: design.customerId, clientName: customer.name, designRequestId: design._id, designRequestName: designRequestName(design),
      scheduledFor, durationMinutes: input.durationMinutes, location: lotAddress,
      notes: "Check the lot's size and shape, which side faces the road for sunlight and airflow, and whether the requested design fits.",
      status: "Scheduled", paymentStatus: "Not applicable",
      createdBy: new ObjectId(actor.id), createdByName: actor.name, createdAt: now, updatedAt: now,
    };
    await schedules.insertOne(visit, { session });
    const inspection: SiteInspectionDocument = {
      status: "Scheduled", scheduledFor, durationMinutes: input.durationMinutes, scheduleId: visit._id, scheduledByName: actor.name,
    };
    await requests.updateOne({ _id: design._id }, {
      $set: { lotAddress, lotAddressDetails, siteInspection: inspection, status: "In review", updatedAt: now },
    }, { session });
    await insertNotifications(db, [{
      _id: new ObjectId(), userId: design.customerId, kind: "site-inspection", entityId: design._id, href: "/customer/design-requests",
      title: previous ? "Site inspection moved" : "Site inspection scheduled",
      body: `G4 Builders will inspect your lot at ${lotAddress} on ${formatScheduleDate(scheduledFor)}. The design request is reviewed after the visit.`,
      createdAt: now,
    }], session);
    await audit(db, session, actor, previous ? "site-inspection.moved" : "site-inspection.scheduled", "design_request", design._id, {
      scheduledFor: scheduledFor.toISOString(), lotAddress,
    });
    return toSiteInspectionDto(inspection);
  });
}

/**
 * Saves what the architect or engineer found on the lot. "Approved" lets the admin approve the request next;
 * "Not suitable" declines the request with the reason, and the customer is told why.
 */
export async function recordSiteInspection(db: Db, actor: SessionUser, rawId: string, raw: unknown, now = new Date()) {
  requireAdmin(actor);
  const input = recordSchema.parse(raw);
  const id = designId(rawId);
  return billingTransaction(db, async (session) => {
    const requests = db.collection<DesignRequestDocument>(collections.designRequests);
    const design = await requests.findOne({ _id: id }, { session });
    if (!design) throw new BillingError("Design request not found.", 404);
    const scheduled = design.siteInspection;
    if (!scheduled) throw new BillingError("Schedule the site inspection first.", 409);
    if (scheduled.status !== "Scheduled") throw new BillingError("This site inspection was already recorded.", 409);
    const { result, photos: sitePhotos, ...found } = input;
    const inspection: SiteInspectionDocument = {
      ...scheduled, ...found, status: result, ...(sitePhotos.length ? { photos: sitePhotos } : {}),
      recordedAt: now, recordedByName: actor.name,
    };
    // An empty note is not worth storing.
    if ("notes" in inspection && !inspection.notes) delete inspection.notes;
    const notSuitable = result === "Not suitable";
    await requests.updateOne({ _id: design._id }, {
      $set: { siteInspection: inspection, ...(notSuitable ? { status: "Rejected" as const } : {}), updatedAt: now },
    }, { session });
    await db.collection<ScheduleDocument>(collections.schedules)
      .updateOne({ _id: scheduled.scheduleId, status: "Scheduled" }, { $set: { status: "Completed", updatedAt: now } }, { session });
    if (notSuitable) {
      await db.collection<ApprovalDocument>(collections.approvals).updateOne(
        { recordType: "Design request", recordId: design._id, status: "Pending" },
        { $set: { status: "Rejected", reviewedAt: now, reviewedBy: new ObjectId(actor.id), reviewNote: `Site not suitable: ${input.reason}` } },
        { session },
      );
    }
    const where = design.lotAddress ? ` at ${design.lotAddress}` : "";
    await insertNotifications(db, [{
      _id: new ObjectId(), userId: design.customerId, kind: "site-inspection", entityId: design._id, href: "/customer/design-requests",
      title: notSuitable ? "Design request declined after the site inspection" : "Your site was approved",
      body: notSuitable
        ? `After inspecting your lot${where}, it is not suitable for this design: ${input.reason}`
        : `Your lot${where} was inspected and approved.${inspection.notes ? ` Notes: ${inspection.notes}` : ""} The admin reviews your design request next.`,
      createdAt: now,
    }], session);
    await audit(db, session, actor, notSuitable ? "site-inspection.not-suitable" : "site-inspection.approved", "design_request", design._id, {
      ...(notSuitable ? { reason: input.reason } : { lotArea: input.lotArea, frontage: input.frontage, depth: input.depth, facing: input.facing }),
    });
    return toSiteInspectionDto(inspection);
  });
}
