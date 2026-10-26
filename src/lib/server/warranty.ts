import { ObjectId, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import {
  collections,
  type DesignRequestDocument,
  type EstimateDocument,
  type ProjectDocument,
  type ScheduleDocument,
  type UserDocument,
  type WarrantyClaimDocument,
  type WarrantyVisitDocument,
} from "@/lib/database/collections";
import { manilaDate } from "@/lib/billing";
import { audit, BillingError, billingTransaction, nextReference } from "@/lib/server/billing";
import { embeddedImageSchema } from "@/lib/server/embedded-images";
import { getSystemSettings } from "@/lib/server/maintenance";
import { insertNotifications } from "@/lib/server/notifications";
import { assertMeetingSlotFree, formatScheduleDate } from "@/lib/server/schedules";
import { getWarrantyLists } from "@/lib/server/warranty-settings";
import {
  addMonths,
  daysBetween,
  maxClaimPhotos,
  maxInspectionPhotos,
  openWarrantyClaimStatuses,
  warrantyDate,
  warrantyLengthLabel,
  warrantyLimits,
  type WarrantyClaimStatus,
} from "@/lib/warranty";
import type { SessionUser } from "@/types/domain";
import type {
  ProjectWarrantyDto,
  WarrantyCertificateDto,
  WarrantyClaimDto,
  WarrantyClaimsResponse,
} from "@/types/warranty";

const dayMs = 86_400_000;
const idPattern = /^[a-f\d]{24}$/i;
/** A customer can't have more open claims than this on one house; it stops accidental repeats. */
const maxOpenClaimsPerProject = 10;

const dayStart = (date: string) => new Date(`${date}T00:00:00.000Z`);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const recordId = (value: string, message: string) => {
  if (!idPattern.test(value)) throw new BillingError(message, 404);
  return new ObjectId(value);
};
const projectLabel = (claim: Pick<WarrantyClaimDocument, "projectReference" | "projectName">) => `${claim.projectReference} · ${claim.projectName}`;
const adminHref = (claimId: ObjectId) => `/admin/projects?tab=warranty&claim=${claimId.toHexString()}`;
const customerHref = "/customer/dream-house";

// ───────────────────────── Project warranty ─────────────────────────

/** What is saved on a project when it is completed: the length in force that day and its last covered day. */
export function warrantyOnCompletion(completedAt: Date, months: number): Pick<ProjectDocument, "warrantyMonths" | "warrantyEndsAt"> {
  return { warrantyMonths: months, warrantyEndsAt: dayStart(addMonths(manilaDate(completedAt), months)) };
}

type WarrantyFields = Pick<ProjectDocument, "status" | "completedAt" | "updatedAt" | "warrantyMonths" | "warrantyEndsAt">;

/** The warranty of a completed project; projects completed before warranties existed use `fallbackMonths`. */
export function projectWarranty(project: WarrantyFields, fallbackMonths: number, now = new Date()): ProjectWarrantyDto | null {
  if (project.status !== "Completed") return null;
  const startsOn = manilaDate(project.completedAt ?? project.updatedAt);
  const months = project.warrantyMonths ?? fallbackMonths;
  const endsOn = project.warrantyEndsAt ? isoDay(project.warrantyEndsAt) : addMonths(startsOn, months);
  const daysLeft = daysBetween(manilaDate(now), endsOn);
  return { months, startsOn, endsOn, active: daysLeft >= 0, daysLeft };
}

/** The moment the warranty is over: the start of the day after its last covered day. */
export function warrantyOverAt(project: WarrantyFields, fallbackMonths: number) {
  const warranty = projectWarranty(project, fallbackMonths);
  return warranty ? new Date(dayStart(warranty.endsOn).getTime() + dayMs) : null;
}

/**
 * Projects completed before warranties existed get one counted from their completion date. It is saved once, so a
 * later change to the Warranty length in Maintenance does not move it.
 */
export async function ensureWarrantyDates(db: Db) {
  const projects = db.collection<ProjectDocument>(collections.projects);
  const missing = await projects.find(
    { status: "Completed", warrantyEndsAt: { $exists: false } },
    { projection: { completedAt: 1, updatedAt: 1 } },
  ).toArray();
  if (!missing.length) return;
  const { warrantyMonths } = await getSystemSettings(db);
  await projects.bulkWrite(missing.map((project) => ({
    updateOne: {
      filter: { _id: project._id, warrantyEndsAt: { $exists: false } },
      update: { $set: warrantyOnCompletion(project.completedAt ?? project.updatedAt, warrantyMonths) },
    },
  })));
}

/** Where G4 Builders visits: the site address from the accepted estimate, else the lot address of the design request. */
async function projectSiteAddress(db: Db, project: Pick<ProjectDocument, "estimateId" | "designRequestId">, session?: ClientSession) {
  const estimate = project.estimateId
    ? await db.collection<EstimateDocument>(collections.estimates).findOne({ _id: project.estimateId }, { session, projection: { siteAddress: 1 } })
    : null;
  if (estimate?.siteAddress) return estimate.siteAddress;
  const design = project.designRequestId
    ? await db.collection<DesignRequestDocument>(collections.designRequests).findOne({ _id: project.designRequestId }, { session, projection: { lotAddress: 1 } })
    : null;
  return design?.lotAddress ?? null;
}

// ───────────────────────── Schemas ─────────────────────────

const photos = (max: number) => z.array(embeddedImageSchema).max(max, `Attach up to ${max} photos.`);

const claimSchema = z.object({
  projectId: z.string().regex(idPattern, "Choose the house with the problem."),
  problemType: z.string().trim().min(1, "Choose the problem type."),
  noticedOn: z.iso.date("Choose the date you noticed the problem."),
  location: z.string().trim().min(2, "Enter the location in the house.")
    .max(warrantyLimits.location, `Keep the location under ${warrantyLimits.location} characters.`),
  description: z.string().trim().min(10, "Describe the problem in a sentence or two.")
    .max(warrantyLimits.description, `Keep the description under ${warrantyLimits.description.toLocaleString("en-PH")} characters.`),
  photos: photos(maxClaimPhotos).min(1, "Add at least one photo of the problem."),
}).strict();

const visit = {
  scheduledFor: z.iso.datetime({ error: "Choose the date and time." }),
  durationMinutes: z.number().int().min(30, "Allow at least 30 minutes.").max(480, "Keep the visit within 8 hours.").default(60),
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("schedule-inspection"), ...visit }).strict(),
  z.object({
    action: z.literal("record-inspection"),
    inspectedOn: z.iso.date("Choose the date of the inspection."),
    inspectedBy: z.string().trim().min(2, "Enter who inspected the problem.")
      .max(warrantyLimits.inspectedBy, `Keep the name under ${warrantyLimits.inspectedBy} characters.`),
    findings: z.string().trim().min(10, "Describe what the inspection found.")
      .max(warrantyLimits.findings, `Keep the findings under ${warrantyLimits.findings.toLocaleString("en-PH")} characters.`),
    covered: z.boolean({ error: "Choose whether the problem is covered." }),
    reason: z.string().trim().max(warrantyLimits.notCoveredReason).optional(),
    photos: photos(maxInspectionPhotos).default([]),
  }).strict(),
  z.object({ action: z.literal("schedule-repair"), ...visit }).strict(),
  z.object({
    action: z.literal("mark-repaired"),
    notes: z.string().trim().max(warrantyLimits.repairNotes, `Keep the repair notes under ${warrantyLimits.repairNotes.toLocaleString("en-PH")} characters.`).default(""),
  }).strict(),
  z.object({ action: z.literal("confirm-repair") }).strict(),
], { error: "Choose what to do with the claim." });

// ───────────────────────── DTOs ─────────────────────────

type ListedClaim = WarrantyClaimDocument & { photoCount?: number; resultPhotoCount?: number };

const visitDto = (value: WarrantyVisitDocument) => ({
  scheduledFor: value.scheduledFor.toISOString(), durationMinutes: value.durationMinutes, location: value.location,
});

function toClaimDto(claim: ListedClaim, closeDays: number, withPhotos: boolean): WarrantyClaimDto {
  const { result, repair } = claim;
  return {
    id: claim._id.toHexString(),
    reference: claim.reference,
    status: claim.status,
    project: { id: claim.projectId.toHexString(), reference: claim.projectReference, name: claim.projectName },
    customer: { id: claim.customerId.toHexString(), name: claim.customerName },
    problemType: claim.problemType,
    location: claim.location,
    description: claim.description,
    noticedOn: isoDay(claim.noticedOn),
    reportedAt: claim.createdAt.toISOString(),
    warrantyEndsOn: isoDay(claim.warrantyEndsAt),
    photoCount: claim.photoCount ?? claim.photos?.length ?? 0,
    ...(withPhotos ? { photos: claim.photos ?? [] } : {}),
    inspection: claim.inspection ? visitDto(claim.inspection) : null,
    result: result ? {
      inspectedOn: isoDay(result.inspectedOn),
      inspectedBy: result.inspectedBy,
      findings: result.findings,
      covered: result.covered,
      reason: result.reason ?? null,
      photoCount: claim.resultPhotoCount ?? result.photos?.length ?? 0,
      ...(withPhotos ? { photos: result.photos ?? [] } : {}),
      recordedAt: result.recordedAt.toISOString(),
      recordedByName: result.recordedByName,
    } : null,
    repair: repair ? {
      ...visitDto(repair),
      repairedAt: repair.repairedAt?.toISOString() ?? null,
      notes: repair.notes ?? null,
      repairedByName: repair.repairedByName ?? null,
    } : null,
    closesOn: claim.status === "Repaired" && repair?.repairedAt ? manilaDate(new Date(repair.repairedAt.getTime() + closeDays * dayMs)) : null,
    closedAt: claim.closedAt?.toISOString() ?? null,
    closedBy: claim.closedBy ?? null,
    updatedAt: claim.updatedAt.toISOString(),
  };
}

// ───────────────────────── Notifications ─────────────────────────

async function notifyUsers(db: Db, session: ClientSession | undefined, userIds: ObjectId[], claim: WarrantyClaimDocument, note: { title: string; body: string; href: string }, now: Date) {
  if (!userIds.length) return;
  await insertNotifications(db, userIds.map((userId) => ({
    _id: new ObjectId(), userId, kind: "warranty-claim", entityId: claim._id, ...note, createdAt: now,
  })), session);
}

async function activeAdmins(db: Db, session?: ClientSession) {
  return (await db.collection<UserDocument>(collections.users)
    .find({ role: "admin", status: "active" }, { session, projection: { _id: 1 } }).toArray()).map((user) => user._id);
}

// ───────────────────────── Claims ─────────────────────────

/**
 * Repaired claims the customer never confirmed close by themselves after the days set in Maintenance. Runs before
 * claims are listed and in the daily job, so it needs no schedule of its own.
 */
export async function closeRepairedClaims(db: Db, now = new Date()) {
  const { warrantyCloseDays } = await getSystemSettings(db);
  const claims = db.collection<WarrantyClaimDocument>(collections.warrantyClaims);
  const due = await claims.find(
    { status: "Repaired", "repair.repairedAt": { $lte: new Date(now.getTime() - warrantyCloseDays * dayMs) } },
    { projection: { photos: 0, "result.photos": 0 } },
  ).toArray();
  let closed = 0;
  for (const claim of due) {
    const moved = await claims.updateOne({ _id: claim._id, status: "Repaired" }, { $set: { status: "Closed", closedAt: now, closedBy: "automatic", updatedAt: now } });
    if (!moved.modifiedCount) continue;
    closed += 1;
    await notifyUsers(db, undefined, [claim.customerId], claim, {
      title: "Warranty claim closed",
      body: `${claim.reference} (${claim.problemType}) was closed ${warrantyCloseDays} days after the repair. If the problem comes back, report it again while your warranty runs.`,
      href: customerHref,
    }, now);
  }
  return { closed };
}

function requireClaimRole(actor: SessionUser) {
  if (actor.role !== "customer" && actor.role !== "admin") throw new BillingError("You do not have access to warranty claims.", 403);
}

/** Customers see their own claims and the problem types they can report; the Admin sees every claim. */
export async function listWarrantyClaims(db: Db, actor: SessionUser): Promise<WarrantyClaimsResponse> {
  requireClaimRole(actor);
  await closeRepairedClaims(db);
  const [settings, lists, claims] = await Promise.all([
    getSystemSettings(db),
    getWarrantyLists(db),
    db.collection<WarrantyClaimDocument>(collections.warrantyClaims).aggregate<ListedClaim>([
      { $match: actor.role === "customer" ? { customerId: new ObjectId(actor.id) } : {} },
      { $sort: { createdAt: -1 } },
      { $limit: 500 },
      // Photos are loaded with a single claim; the list only needs how many there are.
      { $set: { photoCount: { $size: { $ifNull: ["$photos", []] } }, resultPhotoCount: { $size: { $ifNull: ["$result.photos", []] } } } },
      { $unset: ["photos", "result.photos"] },
    ]).toArray(),
  ]);
  return {
    claims: claims.map((claim) => toClaimDto(claim, settings.warrantyCloseDays, false)),
    problemTypes: lists.problemTypes.filter((type) => type.shown).map((type) => type.name),
    warrantyMonths: settings.warrantyMonths,
    closeDays: settings.warrantyCloseDays,
  };
}

async function findClaim(db: Db, actor: SessionUser, id: string, session?: ClientSession) {
  const claim = await db.collection<WarrantyClaimDocument>(collections.warrantyClaims).findOne({ _id: recordId(id, "Warranty claim not found.") }, { session });
  if (!claim || (actor.role === "customer" && !claim.customerId.equals(new ObjectId(actor.id)))) throw new BillingError("Warranty claim not found.", 404);
  return claim;
}

export async function getWarrantyClaim(db: Db, actor: SessionUser, id: string): Promise<WarrantyClaimDto> {
  requireClaimRole(actor);
  await closeRepairedClaims(db);
  const [claim, { warrantyCloseDays }] = await Promise.all([findClaim(db, actor, id), getSystemSettings(db)]);
  return toClaimDto(claim, warrantyCloseDays, true);
}

/** A customer reports a problem with their completed house while its warranty runs; every Admin is notified. */
export async function createWarrantyClaim(db: Db, actor: SessionUser, raw: unknown, now = new Date()): Promise<WarrantyClaimDto> {
  if (actor.role !== "customer") throw new BillingError("Only the homeowner can report a problem with their house.", 403);
  const input = claimSchema.parse(raw);
  const customerId = new ObjectId(actor.id);
  const [settings, lists] = await Promise.all([getSystemSettings(db), getWarrantyLists(db)]);
  const project = await db.collection<ProjectDocument>(collections.projects).findOne({ _id: new ObjectId(input.projectId), customerId });
  if (!project) throw new BillingError("Project not found.", 404);
  const warranty = projectWarranty(project, settings.warrantyMonths, now);
  if (!warranty) throw new BillingError("You can report a problem once your house is completed.", 409);
  if (!warranty.active) throw new BillingError(`The warranty for this house ended on ${warrantyDate(warranty.endsOn)}. Contact G4 Builders if you need repairs.`, 409);
  if (!lists.problemTypes.some((type) => type.shown && type.name === input.problemType)) throw new BillingError("Choose one of the listed problem types.", 400);
  if (input.noticedOn > manilaDate(now)) throw new BillingError("The date you noticed the problem can't be in the future.", 400);
  if (input.noticedOn < warranty.startsOn) throw new BillingError(`Choose a date from ${warrantyDate(warranty.startsOn)}, when your house was completed.`, 400);

  return billingTransaction(db, async (session) => {
    const claims = db.collection<WarrantyClaimDocument>(collections.warrantyClaims);
    const open = await claims.countDocuments({ projectId: project._id, status: { $in: [...openWarrantyClaimStatuses] } }, { session });
    if (open >= maxOpenClaimsPerProject) {
      throw new BillingError(`You already have ${maxOpenClaimsPerProject} open reports for this house. Wait for G4 Builders to finish one first.`, 409);
    }
    const customer = await db.collection<UserDocument>(collections.users).findOne({ _id: customerId }, { session, projection: { name: 1 } });
    const claim: WarrantyClaimDocument = {
      _id: new ObjectId(), reference: await nextReference(db, session, "WC", now),
      customerId, customerName: customer?.name ?? actor.name,
      projectId: project._id, projectReference: project.reference, projectName: project.name,
      problemType: input.problemType, noticedOn: dayStart(input.noticedOn), location: input.location, description: input.description,
      photos: input.photos, warrantyEndsAt: dayStart(warranty.endsOn), status: "Submitted", createdAt: now, updatedAt: now,
    };
    await claims.insertOne(claim, { session });
    await notifyUsers(db, session, await activeAdmins(db, session), claim, {
      title: "New warranty claim",
      body: `${claim.customerName} reported a problem with ${projectLabel(claim)}: ${claim.problemType} (${claim.location}). Schedule an inspection at the house.`,
      href: adminHref(claim._id),
    }, now);
    await audit(db, session, actor, "warranty-claim.submitted", "warranty_claim", claim._id, {
      reference: claim.reference, project: claim.projectReference, problemType: claim.problemType,
    });
    return toClaimDto(claim, settings.warrantyCloseDays, true);
  });
}

/** Books (or moves) a visit to the house as a client meeting, so it shows in both calendars and blocks the time slot. */
async function bookVisit(db: Db, session: ClientSession, actor: SessionUser, claim: WarrantyClaimDocument, kind: "inspection" | "repair",
  input: { scheduledFor: string; durationMinutes: number }, now: Date): Promise<WarrantyVisitDocument> {
  const scheduledFor = new Date(input.scheduledFor);
  if (scheduledFor.getTime() <= now.getTime()) throw new BillingError(`Choose a ${kind} time in the future.`, 400);
  const previous = claim[kind];
  const schedules = db.collection<ScheduleDocument>(collections.schedules);
  // Moving the visit frees its old slot first, so it never clashes with itself.
  if (previous) await schedules.updateOne({ _id: previous.scheduleId, status: "Scheduled" }, { $set: { status: "Cancelled", updatedAt: now } }, { session });
  await assertMeetingSlotFree(db, scheduledFor, input.durationMinutes, session);
  const project = await db.collection<ProjectDocument>(collections.projects).findOne({ _id: claim.projectId }, { session, projection: { estimateId: 1, designRequestId: 1 } });
  const location = (project && await projectSiteAddress(db, project, session)) ?? "The customer's house";
  const event: ScheduleDocument = {
    _id: new ObjectId(),
    title: `Warranty ${kind} — ${claim.reference} ${claim.problemType}`,
    eventType: "Client meeting", clientId: claim.customerId, clientName: claim.customerName,
    projectId: claim.projectId, projectName: projectLabel(claim),
    scheduledFor, durationMinutes: input.durationMinutes, location,
    notes: kind === "inspection"
      ? `Inspect the reported problem: ${claim.problemType} at ${claim.location}. Decide whether the warranty covers it.`
      : `Repair the covered problem: ${claim.problemType} at ${claim.location}. Covered repairs are free of charge.`,
    status: "Scheduled", paymentStatus: "Not applicable",
    createdBy: new ObjectId(actor.id), createdByName: actor.name, createdAt: now, updatedAt: now,
  };
  await schedules.insertOne(event, { session });
  return { scheduleId: event._id, scheduledFor, durationMinutes: input.durationMinutes, location, scheduledByName: actor.name };
}

function requireStatus(claim: WarrantyClaimDocument, allowed: WarrantyClaimStatus[], message: string) {
  if (!allowed.includes(claim.status)) throw new BillingError(message, 409);
}

/**
 * The Admin moves a claim along (book the inspection, record the result, book the repair, mark it repaired); the
 * customer confirms a finished repair. The customer is told about every step.
 */
export async function changeWarrantyClaim(db: Db, actor: SessionUser, id: string, raw: unknown, now = new Date()): Promise<WarrantyClaimDto> {
  requireClaimRole(actor);
  const input = actionSchema.parse(raw);
  if ((input.action === "confirm-repair") !== (actor.role === "customer")) {
    throw new BillingError(actor.role === "customer" ? "Only G4 Builders can update this claim." : "Only the homeowner can confirm the repair.", 403);
  }
  const [settings, lists] = await Promise.all([getSystemSettings(db), getWarrantyLists(db)]);
  if (input.action === "record-inspection") {
    if (input.inspectedOn > manilaDate(now)) throw new BillingError("The inspection date can't be in the future.", 400);
    if (!input.covered && !lists.notCoveredReasons.includes(input.reason ?? "")) throw new BillingError("Choose why the problem is not covered.", 400);
  }

  return billingTransaction(db, async (session) => {
    const claims = db.collection<WarrantyClaimDocument>(collections.warrantyClaims);
    const claim = await findClaim(db, actor, id, session);
    const schedules = db.collection<ScheduleDocument>(collections.schedules);
    const finishVisit = (visitDocument?: WarrantyVisitDocument) => visitDocument
      ? schedules.updateOne({ _id: visitDocument.scheduleId, status: "Scheduled" }, { $set: { status: "Completed", updatedAt: now } }, { session })
      : null;
    let set: Partial<WarrantyClaimDocument>;
    let toCustomer: { title: string; body: string } | null = null;
    let toAdmins: { title: string; body: string } | null = null;
    let auditAction: string;
    let details: Record<string, string> = {};

    switch (input.action) {
      case "schedule-inspection": {
        requireStatus(claim, ["Submitted", "Inspection scheduled"], "The inspection for this claim was already recorded.");
        const inspection = await bookVisit(db, session, actor, claim, "inspection", input, now);
        const moved = Boolean(claim.inspection);
        set = { status: "Inspection scheduled", inspection };
        toCustomer = {
          title: moved ? "Warranty inspection moved" : "Warranty inspection scheduled",
          body: `G4 Builders will inspect the ${claim.problemType.toLowerCase()} (${claim.location}) at your house on ${formatScheduleDate(inspection.scheduledFor)}. ${claim.reference}.`,
        };
        auditAction = moved ? "warranty-claim.inspection-moved" : "warranty-claim.inspection-scheduled";
        details = { scheduledFor: inspection.scheduledFor.toISOString() };
        break;
      }
      case "record-inspection": {
        requireStatus(claim, ["Inspection scheduled"], claim.status === "Submitted" ? "Schedule the inspection first." : "The inspection for this claim was already recorded.");
        await finishVisit(claim.inspection);
        set = {
          status: input.covered ? "Covered" : "Not covered",
          result: {
            inspectedOn: dayStart(input.inspectedOn), inspectedBy: input.inspectedBy, findings: input.findings, covered: input.covered,
            ...(input.covered ? {} : { reason: input.reason }),
            ...(input.photos.length ? { photos: input.photos } : {}),
            recordedAt: now, recordedByName: actor.name,
          },
        };
        toCustomer = input.covered
          ? { title: "Your reported problem is covered", body: `${claim.reference}: the ${claim.problemType.toLowerCase()} is covered by your warranty. G4 Builders will schedule the repair, free of charge.` }
          : { title: "Your reported problem is not covered", body: `${claim.reference}: after the inspection, the ${claim.problemType.toLowerCase()} is not covered by the warranty. Reason: ${input.reason}.` };
        auditAction = input.covered ? "warranty-claim.covered" : "warranty-claim.not-covered";
        details = input.covered ? { inspectedBy: input.inspectedBy } : { inspectedBy: input.inspectedBy, reason: input.reason ?? "" };
        break;
      }
      case "schedule-repair": {
        requireStatus(claim, ["Covered", "Repair scheduled"], claim.status === "Not covered" ? "This problem is not covered, so there is no repair to schedule." : "Record the inspection result first.");
        const repair = await bookVisit(db, session, actor, claim, "repair", input, now);
        const moved = Boolean(claim.repair);
        set = { status: "Repair scheduled", repair };
        toCustomer = {
          title: moved ? "Warranty repair moved" : "Warranty repair scheduled",
          body: `G4 Builders will repair the ${claim.problemType.toLowerCase()} (${claim.location}) at your house on ${formatScheduleDate(repair.scheduledFor)}, free of charge. ${claim.reference}.`,
        };
        auditAction = moved ? "warranty-claim.repair-moved" : "warranty-claim.repair-scheduled";
        details = { scheduledFor: repair.scheduledFor.toISOString() };
        break;
      }
      case "mark-repaired": {
        requireStatus(claim, ["Repair scheduled"], "Schedule the repair first.");
        await finishVisit(claim.repair);
        set = { status: "Repaired", repair: { ...claim.repair!, repairedAt: now, repairedByName: actor.name, ...(input.notes ? { notes: input.notes } : {}) } };
        const closesOn = warrantyDate(manilaDate(new Date(now.getTime() + settings.warrantyCloseDays * dayMs)));
        toCustomer = {
          title: "Repair finished — confirm it's fixed",
          body: `G4 Builders finished repairing the ${claim.problemType.toLowerCase()} (${claim.reference}). Confirm it's fixed in Dream House. Otherwise the claim closes by itself on ${closesOn}.`,
        };
        auditAction = "warranty-claim.repaired";
        break;
      }
      case "confirm-repair": {
        requireStatus(claim, ["Repaired"], "Only a finished repair can be confirmed.");
        set = { status: "Closed", closedAt: now, closedBy: "customer" };
        toAdmins = { title: "Warranty repair confirmed", body: `${claim.customerName} confirmed the ${claim.problemType.toLowerCase()} is fixed. ${claim.reference} is closed.` };
        auditAction = "warranty-claim.confirmed";
        break;
      }
    }

    const updated = await claims.findOneAndUpdate(
      { _id: claim._id, status: claim.status },
      { $set: { ...set, updatedAt: now } },
      { session, returnDocument: "after" },
    );
    if (!updated) throw new BillingError("The claim changed. Reload it and try again.", 409);
    if (toCustomer) await notifyUsers(db, session, [claim.customerId], claim, { ...toCustomer, href: customerHref }, now);
    if (toAdmins) await notifyUsers(db, session, await activeAdmins(db, session), claim, { ...toAdmins, href: adminHref(claim._id) }, now);
    await audit(db, session, actor, auditAction, "warranty_claim", claim._id, { reference: claim.reference, ...details });
    return toClaimDto(updated, settings.warrantyCloseDays, true);
  });
}

// ───────────────────────── Certificate ─────────────────────────

/** The printable certificate of a completed project's warranty; numbered after the project (PRJ-2026-000001 → WRC-2026-000001). */
export async function getWarrantyCertificate(db: Db, actor: SessionUser, projectId: string): Promise<WarrantyCertificateDto> {
  requireClaimRole(actor);
  const id = recordId(projectId, "Project not found.");
  const project = await db.collection<ProjectDocument>(collections.projects).findOne(
    actor.role === "customer" ? { _id: id, customerId: new ObjectId(actor.id) } : { _id: id },
  );
  if (!project) throw new BillingError("Project not found.", 404);
  const [settings, lists, customer, siteAddress] = await Promise.all([
    getSystemSettings(db),
    getWarrantyLists(db),
    db.collection<UserDocument>(collections.users).findOne({ _id: project.customerId }, { projection: { name: 1 } }),
    projectSiteAddress(db, project),
  ]);
  const warranty = projectWarranty(project, settings.warrantyMonths);
  if (!warranty) throw new BillingError("The warranty certificate is issued once the project is completed.", 409);
  return {
    number: project.reference.replace(/^PRJ-/, "WRC-"),
    customerName: customer?.name ?? "Homeowner",
    project: { reference: project.reference, name: project.name },
    siteAddress,
    months: warranty.months,
    startsOn: warranty.startsOn,
    endsOn: warranty.endsOn,
    covers: lists.problemTypes.filter((type) => type.shown && type.name !== "Other").map((type) => type.name),
    notCovered: lists.notCoveredReasons,
  };
}

/** "Your house is under warranty for 1 year, until Aug 14, 2027." for messages about a completed project. */
export function warrantySummary(warranty: Pick<ProjectWarrantyDto, "months" | "endsOn">) {
  return `Your house is under warranty for ${warrantyLengthLabel(warranty.months)}, until ${warrantyDate(warranty.endsOn)}.`;
}
