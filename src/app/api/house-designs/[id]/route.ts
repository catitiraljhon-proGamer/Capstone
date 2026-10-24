import {
  collections,
  type AuditLogDocument,
  type HouseDesignDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { formatRoomSetup } from "@/lib/house-design-data";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { houseDesignPatchSchema, toHouseDesignDto } from "@/lib/server/house-designs";
import { MaintenanceError } from "@/lib/server/maintenance";
import { requireProfessionalId } from "@/lib/server/professionals";
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

    const submitted = houseDesignPatchSchema.parse(await request.json());
    const { designedBy, ...changes } = submitted;
    const db = await getDatabase();
    // Customers browse designs by house type, so a design needs one before it is published.
    if (changes.status === "Published" && !changes.houseType) {
      const current = await db
        .collection<HouseDesignDocument>(collections.houseDesigns)
        .findOne({ _id: new ObjectId(id) }, { projection: { houseType: 1 } });
      if (current && !current.houseType) {
        return NextResponse.json(
          { error: "Edit the design and select a house type before publishing it." },
          { status: 400 },
        );
      }
    }
    const now = new Date();
    const credit = designedBy ? { designedBy: await requireProfessionalId(db, designedBy) } : {};
    const document = await db
      .collection<HouseDesignDocument>(collections.houseDesigns)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            ...changes,
            ...credit,
            ...(changes.bedrooms !== undefined && changes.bathrooms !== undefined
              ? { rooms: formatRoomSetup(changes.bedrooms, changes.bathrooms) }
              : {}),
            updatedAt: now,
          },
          ...(designedBy === null ? { $unset: { designedBy: "" as const } } : {}),
        },
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
      details: { fields: Object.keys(submitted).join(", ") },
      createdAt: now,
    });

    return NextResponse.json({ design: toHouseDesignDto(document, { includeSource: true }) });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
