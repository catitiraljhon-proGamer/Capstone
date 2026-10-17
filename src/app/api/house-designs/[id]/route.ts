import {
  collections,
  type AuditLogDocument,
  type HouseDesignDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { houseDesignPatchSchema, toHouseDesignDto } from "@/lib/server/house-designs";
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
      return NextResponse.json({ error: "Invalid house-design id." }, { status: 400 });
    }

    const changes = houseDesignPatchSchema.parse(await request.json());
    const db = await getDatabase();
    const now = new Date();
    const document = await db
      .collection<HouseDesignDocument>(collections.houseDesigns)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { ...changes, updatedAt: now } },
        { returnDocument: "after" },
      );

    if (!document) {
      return NextResponse.json({ error: "House design not found." }, { status: 404 });
    }

    await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
      _id: new ObjectId(),
      actorId: new ObjectId(session.id),
      actorName: session.name,
      actorRole: session.role,
      action: "house-design.updated",
      entityType: "house_design",
      entityId: document._id,
      details: { fields: Object.keys(changes).join(", ") },
      createdAt: now,
    });

    return NextResponse.json({ design: toHouseDesignDto(document) });
  } catch (error) {
    return apiError(error);
  }
}
