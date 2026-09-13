import {
  collections,
  type AuditLogDocument,
  type NotificationDocument,
  type ProjectDocument,
  type ScheduleDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { scheduleInputSchema, toScheduleDto } from "@/lib/server/schedules";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

function formatScheduleDate(date: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const db = await getDatabase();
    const [documents, clients, projects] = await Promise.all([
      db
        .collection<ScheduleDocument>(collections.schedules)
        .find()
        .sort({ scheduledFor: 1 })
        .limit(500)
        .toArray(),
      db
        .collection<UserDocument>(collections.users)
        .find({ role: "customer", status: "active" })
        .sort({ name: 1 })
        .toArray(),
      db
        .collection<ProjectDocument>(collections.projects)
        .find({ status: { $ne: "Completed" } })
        .sort({ name: 1 })
        .toArray(),
    ]);

    return NextResponse.json({
      schedules: documents.map(toScheduleDto),
      clients: clients.map((client) => ({
        id: client._id.toHexString(),
        name: client.name,
        email: client.email,
      })),
      projects: projects.map((project) => ({
        id: project._id.toHexString(),
        clientId: project.customerId.toHexString(),
        reference: project.reference,
        name: project.name,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const input = scheduleInputSchema.parse(await request.json());
    const db = await getDatabase();
    const clientId = new ObjectId(input.clientId);
    const projectId = input.projectId ? new ObjectId(input.projectId) : undefined;
    const [client, project] = await Promise.all([
      db.collection<UserDocument>(collections.users).findOne({
        _id: clientId,
        role: "customer",
        status: "active",
      }),
      projectId
        ? db.collection<ProjectDocument>(collections.projects).findOne({
            _id: projectId,
            customerId: clientId,
          })
        : Promise.resolve(null),
    ]);

    if (!client) {
      return NextResponse.json({ error: "The selected client was not found." }, { status: 404 });
    }

    if (projectId && !project) {
      return NextResponse.json(
        { error: "The selected project does not belong to this client." },
        { status: 400 },
      );
    }

    const now = new Date();
    const scheduledFor = new Date(input.scheduledFor);
    const isMeeting = input.eventType === "Client meeting";
    const document: ScheduleDocument = {
      _id: new ObjectId(),
      title: input.title,
      eventType: input.eventType,
      clientId,
      clientName: client.name,
      ...(project
        ? { projectId: project._id, projectName: `${project.reference} · ${project.name}` }
        : {}),
      scheduledFor,
      durationMinutes: input.durationMinutes,
      ...(input.location ? { location: input.location } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      status: input.status,
      paymentStatus: isMeeting ? "Not applicable" : input.paymentStatus,
      ...(!isMeeting && input.expectedAmount !== undefined
        ? { expectedAmount: input.expectedAmount }
        : {}),
      createdBy: new ObjectId(session.id),
      createdByName: session.name,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection<ScheduleDocument>(collections.schedules).insertOne(document);
    await Promise.all([
      db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
        _id: new ObjectId(),
        actorId: new ObjectId(session.id),
        actorName: session.name,
        actorRole: session.role,
        action: "schedule.created",
        entityType: "schedule",
        entityId: document._id,
        details: {
          title: document.title,
          client: document.clientName,
          eventType: document.eventType,
        },
        createdAt: now,
      }),
      db.collection<NotificationDocument>(collections.notifications).insertOne({
        _id: new ObjectId(),
        userId: clientId,
        title: isMeeting ? "Meeting scheduled" : "Payment schedule added",
        body: `${document.title} is scheduled for ${formatScheduleDate(scheduledFor)}.`,
        href: "/customer/notifications",
        createdAt: now,
      }),
    ]);

    return NextResponse.json({ schedule: toScheduleDto(document) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
