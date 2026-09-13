import {
  collections,
  type AuditLogDocument,
  type NotificationDocument,
  type ScheduleDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { scheduleStatusSchema, toScheduleDto } from "@/lib/server/schedules";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const { id } = await context.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid schedule id." }, { status: 400 });
    }

    const changes = scheduleStatusSchema.parse(await request.json());
    const db = await getDatabase();
    const now = new Date();
    const document = await db
      .collection<ScheduleDocument>(collections.schedules)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...changes, updatedAt: now } },
        { returnDocument: "after" },
      );

    if (!document) {
      return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
    }

    await Promise.all([
      db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
        _id: new ObjectId(),
        actorId: new ObjectId(session.id),
        actorName: session.name,
        actorRole: session.role,
        action: "schedule.status-updated",
        entityType: "schedule",
        entityId: document._id,
        details: {
          ...(changes.status ? { status: changes.status } : {}),
          ...(changes.paymentStatus
            ? { paymentStatus: changes.paymentStatus }
            : {}),
        },
        createdAt: now,
      }),
      db.collection<NotificationDocument>(collections.notifications).insertOne({
        _id: new ObjectId(),
        userId: document.clientId,
        title: "Schedule status updated",
        body: `${document.title}: ${changes.paymentStatus ?? changes.status}.`,
        href: "/customer/notifications",
        createdAt: now,
      }),
    ]);

    return NextResponse.json({ schedule: toScheduleDto(document) });
  } catch (error) {
    return apiError(error);
  }
}
