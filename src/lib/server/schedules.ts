import { ObjectId, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import {
  collections,
  type DesignRequestDocument,
  type MeetingRequestDocument,
  type ProjectDocument,
  type ScheduleDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { audit, BillingError, billingTransaction } from "@/lib/server/billing";
import { insertNotifications } from "@/lib/server/notifications";
import { designWorkflow, feeInvoiceState } from "@/lib/server/design-requests";
import { designRequestName } from "@/lib/design-request-subject";
import { isWithinOfficeHours, officeHoursText } from "@/lib/office-hours";
import { listPaymentDues } from "@/lib/server/payment-dues";
import type { SessionUser } from "@/types/domain";
import type {
  CustomerScheduleData,
  MeetingRequestDto,
  ScheduleDto,
  ScheduleEventType,
  StaffScheduleData,
} from "@/types/schedules";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Select a valid record.");
const statusSchema = z.enum(["Scheduled", "Completed", "Cancelled"]);
const day = 24 * 60 * 60 * 1000;

/** Each staff role manages one kind of event; the other kind is view-only for them. */
const managedEventType: Record<"admin" | "billing-clerk", ScheduleEventType> = {
  admin: "Client meeting",
  "billing-clerk": "Payment follow-up",
};

export const scheduleInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  clientId: objectIdSchema,
  projectId: z.union([objectIdSchema, z.literal("")]).optional(),
  scheduledFor: z.iso.datetime(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  location: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1_000).optional(),
  status: statusSchema,
});

export const scheduleStatusSchema = z.object({ status: statusSchema }).strict();

export const meetingRequestInputSchema = z.object({
  topic: z.string().trim().min(3, "Enter what the meeting is about.").max(120),
  details: z.string().trim().max(1_000).optional(),
  mode: z.enum(["In person", "Online"]),
  /** "general", "project:<id>", or "design-request:<id>", so the admin knows what the meeting is for. */
  relatedTo: z.string({ error: "Choose what the meeting is related to." })
    .regex(/^(general|project:[a-f\d]{24}|design-request:[a-f\d]{24})$/i, "Choose what the meeting is related to."),
  preferredTimes: z.array(z.iso.datetime()).min(1, "Choose at least one preferred time.").max(3, "Choose up to three preferred times."),
}).strict();

const meetingReviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({
    action: z.literal("approve"),
    scheduledFor: z.iso.datetime(),
    durationMinutes: z.number().int().min(15).max(480),
    location: z.string().trim().max(160).optional(),
  }).strict(),
  z.object({ action: z.literal("decline"), reason: z.string().trim().min(3, "Enter a reason for the customer.").max(500) }).strict(),
]);

export const pickupRequestInputSchema = z.object({
  preferredTimes: z.array(z.iso.datetime()).min(1, "Choose at least one preferred time.").max(3, "Choose up to three preferred times."),
  details: z.string().trim().max(500).optional(),
}).strict();

/** Customers can keep this many requests waiting at once. */
const maxPendingRequests = 3;

export function formatScheduleDate(date: Date) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(date);
}

export function toScheduleDto(document: ScheduleDocument): ScheduleDto {
  return {
    id: document._id.toHexString(),
    title: document.title,
    eventType: document.eventType === "Payment follow-up" ? "Payment follow-up" : "Client meeting",
    clientId: document.clientId.toHexString(),
    clientName: document.clientName,
    projectId: document.projectId?.toHexString(),
    projectName: document.projectName,
    ...(document.designRequestName ? { designRequestName: document.designRequestName } : {}),
    scheduledFor: document.scheduledFor.toISOString(),
    durationMinutes: document.durationMinutes,
    location: document.location,
    notes: document.notes,
    status: document.status,
    createdByName: document.createdByName,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function toMeetingRequestDto(document: MeetingRequestDocument): MeetingRequestDto {
  return {
    id: document._id.toHexString(),
    customerId: document.customerId.toHexString(),
    customerName: document.customerName,
    projectId: document.projectId?.toHexString(),
    projectName: document.projectName,
    ...(document.designRequestName ? { designRequestName: document.designRequestName } : {}),
    topic: document.topic,
    details: document.details,
    mode: document.mode,
    preferredTimes: document.preferredTimes.map((time) => time.toISOString()),
    status: document.status,
    scheduledFor: document.scheduledFor?.toISOString(),
    declineReason: document.declineReason,
    ...(document.purpose ? { purpose: document.purpose } : {}),
    ...(document.designRequestId ? { designRequestId: document.designRequestId.toHexString() } : {}),
    createdAt: document.createdAt.toISOString(),
  };
}

function staffRole(actor: SessionUser) {
  if (actor.role === "customer") throw new BillingError("Only staff can manage the schedule.", 403);
  return actor.role;
}

function recordId(id: string, label = "Record") {
  if (!ObjectId.isValid(id)) throw new BillingError(`${label} not found.`, 404);
  return new ObjectId(id);
}

function projectLabel(project: Pick<ProjectDocument, "reference" | "name">) {
  return `${project.reference} · ${project.name}`;
}

/** Admin and Billing Clerk calendars: both see every customer payment date and all client meetings. */
export async function getStaffSchedule(db: Db, actor: SessionUser): Promise<StaffScheduleData> {
  const role = staffRole(actor);
  const [documents, requests, clients, projects, paymentDues] = await Promise.all([
    db.collection<ScheduleDocument>(collections.schedules)
      .find({ eventType: role === "admin" ? "Client meeting" : { $in: ["Client meeting", "Payment follow-up"] } })
      .sort({ scheduledFor: 1 }).limit(1_000).toArray(),
    role === "admin"
      ? db.collection<MeetingRequestDocument>(collections.meetingRequests).find({ status: "Pending" }).sort({ createdAt: 1 }).limit(200).toArray()
      : [],
    db.collection<UserDocument>(collections.users).find({ role: "customer", status: "active" }, { projection: { name: 1, email: 1 } }).sort({ name: 1 }).toArray(),
    db.collection<ProjectDocument>(collections.projects).find({ status: { $ne: "Completed" } }, { projection: { customerId: 1, reference: 1, name: 1 } }).sort({ name: 1 }).toArray(),
    listPaymentDues(db),
  ]);
  return {
    schedules: documents.map(toScheduleDto),
    meetingRequests: requests.map(toMeetingRequestDto),
    clients: clients.map((client) => ({ id: client._id.toHexString(), name: client.name, email: client.email })),
    projects: projects.map((project) => ({ id: project._id.toHexString(), clientId: project.customerId.toHexString(), reference: project.reference, name: project.name })),
    paymentDues,
  };
}

/** A customer's own meetings, payment dates, and meeting requests. Payment follow-ups and staff notes stay internal. */
export async function getCustomerSchedule(db: Db, actor: SessionUser): Promise<CustomerScheduleData> {
  if (actor.role !== "customer") throw new BillingError("Only customers have a personal schedule.", 403);
  const customerId = recordId(actor.id, "Account");
  const [meetings, requests, projects, designRequests, paymentDues] = await Promise.all([
    db.collection<ScheduleDocument>(collections.schedules)
      .find({ clientId: customerId, eventType: "Client meeting" }).sort({ scheduledFor: 1 }).limit(500).toArray(),
    db.collection<MeetingRequestDocument>(collections.meetingRequests)
      .find({ customerId }).sort({ createdAt: -1 }).limit(30).toArray(),
    db.collection<ProjectDocument>(collections.projects)
      .find({ customerId, status: { $ne: "Completed" } }, { projection: { reference: 1, name: 1 } }).sort({ name: 1 }).toArray(),
    db.collection<DesignRequestDocument>(collections.designRequests)
      .find({ customerId, status: { $ne: "Rejected" } }, { projection: { selectedDesign: 1, floorArea: 1, houseType: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(20).toArray(),
    listPaymentDues(db, { customerId }),
  ]);
  return {
    meetings: meetings.map((meeting) => ({
      id: meeting._id.toHexString(), title: meeting.title, projectName: meeting.projectName,
      ...(meeting.designRequestName ? { designRequestName: meeting.designRequestName } : {}),
      scheduledFor: meeting.scheduledFor.toISOString(), durationMinutes: meeting.durationMinutes,
      location: meeting.location, status: meeting.status,
    })),
    meetingRequests: requests.map(toMeetingRequestDto),
    projects: projects.map((project) => ({ id: project._id.toHexString(), reference: project.reference, name: project.name })),
    designRequests: designRequests.map((request) => ({ id: request._id.toHexString(), name: designRequestName(request) })),
    paymentDues,
  };
}

async function findCustomerAndProject(db: Db, clientId: ObjectId, projectId: ObjectId | undefined, session?: ClientSession) {
  const [client, project] = await Promise.all([
    db.collection<UserDocument>(collections.users).findOne({ _id: clientId, role: "customer", status: "active" }, { session, projection: { name: 1 } }),
    projectId ? db.collection<ProjectDocument>(collections.projects).findOne({ _id: projectId, customerId: clientId }, { session, projection: { reference: 1, name: 1 } }) : null,
  ]);
  if (!client) throw new BillingError("The selected client was not found.", 404);
  if (projectId && !project) throw new BillingError("The selected project does not belong to this client.", 400);
  return { client, project };
}

/** Client meetings must not overlap; the admin picks another time instead. */
export async function assertMeetingSlotFree(db: Db, start: Date, durationMinutes: number, session?: ClientSession) {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const nearby = await db.collection<ScheduleDocument>(collections.schedules).find({
    eventType: "Client meeting", status: "Scheduled",
    scheduledFor: { $gt: new Date(start.getTime() - 8 * 60 * 60_000), $lt: end },
  }, { session, projection: { title: 1, scheduledFor: 1, durationMinutes: 1 } }).toArray();
  const clash = nearby.find((meeting) => meeting.scheduledFor.getTime() + meeting.durationMinutes * 60_000 > start.getTime());
  if (clash) throw new BillingError(`Another meeting (${clash.title}) is already scheduled at ${formatScheduleDate(clash.scheduledFor)}. Choose another time.`, 409);
}

/** Admin adds client meetings; the Billing Clerk adds payment follow-ups (internal, so the customer is not notified). */
export async function createSchedule(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  const role = staffRole(actor);
  const input = scheduleInputSchema.parse(raw);
  const eventType = managedEventType[role];
  const clientId = recordId(input.clientId, "Client");
  const { client, project } = await findCustomerAndProject(db, clientId, input.projectId ? recordId(input.projectId, "Project") : undefined);
  const scheduledFor = new Date(input.scheduledFor);
  const isMeeting = eventType === "Client meeting";
  // Payment follow-ups are point-in-time reminders; only meetings block a time slot.
  const durationMinutes = isMeeting ? input.durationMinutes ?? 60 : 15;
  if (isMeeting && input.status === "Scheduled") await assertMeetingSlotFree(db, scheduledFor, durationMinutes);

  const document: ScheduleDocument = {
    _id: new ObjectId(), title: input.title, eventType, clientId, clientName: client.name,
    ...(project ? { projectId: project._id, projectName: projectLabel(project) } : {}),
    scheduledFor, durationMinutes,
    ...(input.location ? { location: input.location } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    status: input.status, paymentStatus: "Not applicable",
    createdBy: new ObjectId(actor.id), createdByName: actor.name, createdAt: now, updatedAt: now,
  };
  await billingTransaction(db, async (session) => {
    await db.collection<ScheduleDocument>(collections.schedules).insertOne(document, { session });
    await audit(db, session, actor, "schedule.created", "schedule", document._id, { title: document.title, client: client.name, eventType });
    if (isMeeting) {
      await insertNotifications(db, [{
        _id: new ObjectId(), userId: clientId, kind: "schedule", entityId: document._id, href: "/customer/schedule",
        title: "Meeting scheduled", body: `${document.title} is scheduled for ${formatScheduleDate(scheduledFor)}.`, createdAt: now,
      }], session);
    }
  });
  return toScheduleDto(document);
}

export async function updateScheduleStatus(db: Db, actor: SessionUser, id: string, raw: unknown, now = new Date()) {
  const role = staffRole(actor);
  const { status } = scheduleStatusSchema.parse(raw);
  const eventType = managedEventType[role];
  return billingTransaction(db, async (session) => {
    const document = await db.collection<ScheduleDocument>(collections.schedules).findOneAndUpdate(
      { _id: recordId(id, "Schedule"), eventType }, { $set: { status, updatedAt: now } }, { session, returnDocument: "after" },
    );
    if (!document) throw new BillingError("Schedule not found.", 404);
    await audit(db, session, actor, "schedule.status-updated", "schedule", document._id, { status });
    if (eventType === "Client meeting") {
      await insertNotifications(db, [{
        _id: new ObjectId(), userId: document.clientId, kind: "schedule", entityId: document._id, href: "/customer/schedule",
        title: `Meeting ${status.toLowerCase()}`, body: `${document.title} (${formatScheduleDate(document.scheduledFor)}): ${status}.`, createdAt: now,
      }], session);
    }
    return toScheduleDto(document);
  });
}

/** Requested times must be distinct, between one and 90 days ahead, and inside office hours. */
function assertPreferredTimes(preferredTimes: Date[], now: Date) {
  if (new Set(preferredTimes.map((time) => time.getTime())).size !== preferredTimes.length) {
    throw new BillingError("Each preferred time must be different.", 400);
  }
  for (const time of preferredTimes) {
    if (time.getTime() < now.getTime() + day) throw new BillingError("Choose times at least one day from now.", 400);
    if (time.getTime() > now.getTime() + 90 * day) throw new BillingError("Choose times within the next 90 days.", 400);
    if (!isWithinOfficeHours(time)) throw new BillingError(`Choose times during office hours: ${officeHoursText}.`, 400);
  }
}

export async function requestMeeting(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  if (actor.role !== "customer") throw new BillingError("Only customers can request a meeting.", 403);
  const input = meetingRequestInputSchema.parse(raw);
  const preferredTimes = input.preferredTimes.map((time) => new Date(time));
  assertPreferredTimes(preferredTimes, now);
  const customerId = recordId(actor.id, "Account");
  const requests = db.collection<MeetingRequestDocument>(collections.meetingRequests);
  if (await requests.countDocuments({ customerId, status: "Pending" }) >= maxPendingRequests) {
    throw new BillingError(`You already have ${maxPendingRequests} meeting requests waiting. Wait for a reply or cancel one first.`, 409);
  }
  const [kind, relatedId] = input.relatedTo.split(":");
  const { client, project } = await findCustomerAndProject(db, customerId, kind === "project" ? recordId(relatedId, "Project") : undefined);
  const design = kind === "design-request"
    ? await db.collection<DesignRequestDocument>(collections.designRequests).findOne(
      { _id: recordId(relatedId, "Design request"), customerId },
      { projection: { selectedDesign: 1, floorArea: 1, houseType: 1, createdAt: 1 } },
    )
    : null;
  if (kind === "design-request" && !design) throw new BillingError("The selected design request was not found.", 400);
  const document: MeetingRequestDocument = {
    _id: new ObjectId(), customerId, customerName: client.name,
    ...(project ? { projectId: project._id, projectName: projectLabel(project) } : {}),
    ...(design ? { designRequestId: design._id, designRequestName: designRequestName(design) } : {}),
    topic: input.topic, ...(input.details ? { details: input.details } : {}), mode: input.mode,
    preferredTimes: [...preferredTimes].sort((left, right) => left.getTime() - right.getTime()),
    status: "Pending", createdAt: now, updatedAt: now,
  };
  await billingTransaction(db, async (session) => {
    await requests.insertOne(document, { session });
    const about = document.projectName ?? document.designRequestName ?? "General inquiry";
    await audit(db, session, actor, "meeting-request.created", "meeting_request", document._id, { topic: document.topic, mode: document.mode, about });
    const admins = await db.collection<UserDocument>(collections.users).find({ role: "admin", status: "active" }, { session, projection: { _id: 1 } }).toArray();
    await insertNotifications(db, admins.map((admin) => ({
      _id: new ObjectId(), userId: admin._id, kind: "meeting-request", entityId: document._id, href: "/admin/scheduling",
      title: "New meeting request", body: `${client.name} requested a meeting about ${about}: ${document.topic}.`, createdAt: now,
    })), session);
  });
  return toMeetingRequestDto(document);
}

/** Customers cancel their own pending request; the admin approves it into a client meeting or declines it. */
export async function reviewMeetingRequest(db: Db, actor: SessionUser, id: string, raw: unknown, now = new Date()) {
  const input = meetingReviewSchema.parse(raw);
  const requestId = recordId(id, "Meeting request");
  const requests = db.collection<MeetingRequestDocument>(collections.meetingRequests);

  if (input.action === "cancel") {
    if (actor.role !== "customer") throw new BillingError("Only the customer can cancel their request.", 403);
    const cancelled = await requests.findOneAndUpdate(
      { _id: requestId, customerId: recordId(actor.id, "Account"), status: "Pending" },
      { $set: { status: "Cancelled", updatedAt: now } }, { returnDocument: "after" },
    );
    if (!cancelled) throw new BillingError("Only a request that is still waiting can be cancelled.", 409);
    return { request: toMeetingRequestDto(cancelled) };
  }

  if (actor.role !== "admin") throw new BillingError("Only the admin can approve or decline meeting requests.", 403);
  return billingTransaction(db, async (session) => {
    const pending = await requests.findOne({ _id: requestId, status: "Pending" }, { session });
    if (!pending) throw new BillingError("This request was already answered or cancelled.", 409);
    const review = { reviewedBy: new ObjectId(actor.id), reviewedByName: actor.name, reviewedAt: now, updatedAt: now };

    if (input.action === "decline") {
      const declined = await requests.findOneAndUpdate(
        { _id: requestId, status: "Pending" },
        { $set: { status: "Declined", declineReason: input.reason, ...review } }, { session, returnDocument: "after" },
      );
      await audit(db, session, actor, "meeting-request.declined", "meeting_request", requestId, { reason: input.reason });
      await insertNotifications(db, [{
        _id: new ObjectId(), userId: pending.customerId, kind: "meeting-request", entityId: requestId, href: "/customer/schedule",
        title: "Meeting request declined", body: `${pending.topic}: ${input.reason}`, createdAt: now,
      }], session);
      return { request: toMeetingRequestDto(declined!) };
    }

    const scheduledFor = new Date(input.scheduledFor);
    if (scheduledFor.getTime() <= now.getTime()) throw new BillingError("Choose a meeting time in the future.", 400);
    const { client, project } = await findCustomerAndProject(db, pending.customerId, pending.projectId, session);
    await assertMeetingSlotFree(db, scheduledFor, input.durationMinutes, session);
    const location = input.location || (pending.mode === "Online" ? undefined : "G4 Builders Inc office");
    const meeting: ScheduleDocument = {
      _id: new ObjectId(), title: pending.topic, eventType: "Client meeting", clientId: pending.customerId, clientName: client.name,
      ...(project ? { projectId: project._id, projectName: projectLabel(project) } : {}),
      ...(pending.designRequestId && pending.designRequestName
        ? { designRequestId: pending.designRequestId, designRequestName: pending.designRequestName }
        : {}),
      scheduledFor, durationMinutes: input.durationMinutes, ...(location ? { location } : {}),
      notes: [`Requested by the customer (${pending.mode}).`, pending.details].filter(Boolean).join("\n"),
      status: "Scheduled", paymentStatus: "Not applicable",
      createdBy: new ObjectId(actor.id), createdByName: actor.name, createdAt: now, updatedAt: now,
    };
    await db.collection<ScheduleDocument>(collections.schedules).insertOne(meeting, { session });
    const approved = await requests.findOneAndUpdate(
      { _id: requestId, status: "Pending" },
      { $set: { status: "Approved", scheduleId: meeting._id, scheduledFor, ...review } }, { session, returnDocument: "after" },
    );
    const proposedNewTime = !pending.preferredTimes.some((time) => time.getTime() === scheduledFor.getTime());
    await audit(db, session, actor, "meeting-request.approved", "meeting_request", requestId, { scheduleId: meeting._id.toHexString(), proposedNewTime });
    await insertNotifications(db, [{
      _id: new ObjectId(), userId: pending.customerId, kind: "meeting-request", entityId: meeting._id, href: "/customer/schedule",
      title: pending.purpose === "blueprint-pickup"
        ? (proposedNewTime ? "Blueprint pickup set for a different time" : "Blueprint pickup scheduled")
        : (proposedNewTime ? "Meeting set for a different time" : "Meeting request approved"),
      body: `${pending.topic} is scheduled for ${formatScheduleDate(scheduledFor)}${location ? ` · ${location}` : ""}.${proposedNewTime ? " Your preferred times were not available." : ""}`,
      createdAt: now,
    }], session);
    return { request: toMeetingRequestDto(approved!), schedule: toScheduleDto(meeting) };
  });
}

/**
 * After the blueprint fee is fully paid, the customer asks to pick up the printed blueprint at the office.
 * The admin confirms one of the times (or proposes another) through the usual meeting request review.
 */
export async function requestBlueprintPickup(db: Db, actor: SessionUser, designRequestId: string, raw: unknown, now = new Date()) {
  if (actor.role !== "customer") throw new BillingError("Only customers can schedule a blueprint pickup.", 403);
  const input = pickupRequestInputSchema.parse(raw);
  const preferredTimes = input.preferredTimes.map((time) => new Date(time));
  assertPreferredTimes(preferredTimes, now);
  const customerId = recordId(actor.id, "Account");
  const design = await db.collection<DesignRequestDocument>(collections.designRequests)
    .findOne({ _id: recordId(designRequestId, "Design request"), customerId });
  if (!design) throw new BillingError("Design request not found.", 404);
  if (designWorkflow(design) !== "blueprint" || !(await feeInvoiceState(db, design)).unlocked) {
    throw new BillingError("Pay the blueprint fee in full before scheduling a pickup.", 409);
  }
  const requests = db.collection<MeetingRequestDocument>(collections.meetingRequests);
  const open = await requests.findOne({
    designRequestId: design._id, purpose: "blueprint-pickup",
    $or: [{ status: "Pending" }, { status: "Approved", scheduledFor: { $gt: now } }],
  });
  if (open) {
    throw new BillingError(open.status === "Pending"
      ? "Your pickup request is waiting for the admin. Cancel it first to choose other times."
      : "Your blueprint pickup is already scheduled.", 409);
  }
  const { client } = await findCustomerAndProject(db, customerId, undefined);
  const designName = design.selectedDesign?.name ?? `${design.floorArea.toLocaleString("en-PH")} sqm design`;
  const document: MeetingRequestDocument = {
    _id: new ObjectId(), customerId, customerName: client.name,
    topic: `Blueprint pickup — ${designName}`, ...(input.details ? { details: input.details } : {}), mode: "In person",
    purpose: "blueprint-pickup", designRequestId: design._id,
    preferredTimes: [...preferredTimes].sort((left, right) => left.getTime() - right.getTime()),
    status: "Pending", createdAt: now, updatedAt: now,
  };
  await billingTransaction(db, async (session) => {
    await requests.insertOne(document, { session });
    await audit(db, session, actor, "blueprint-pickup.requested", "meeting_request", document._id, { designRequestId: design._id.toHexString() });
    const admins = await db.collection<UserDocument>(collections.users).find({ role: "admin", status: "active" }, { session, projection: { _id: 1 } }).toArray();
    await insertNotifications(db, admins.map((admin) => ({
      _id: new ObjectId(), userId: admin._id, kind: "meeting-request", entityId: document._id, href: "/admin/scheduling",
      title: "Blueprint pickup request", body: `${client.name} wants to pick up the printed blueprint for ${designName}. Confirm a time in Scheduling.`, createdAt: now,
    })), session);
  });
  return toMeetingRequestDto(document);
}
