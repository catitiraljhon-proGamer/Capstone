import {
  collections,
  type AuditLogDocument,
  type HouseDesignDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { formatRoomSetup } from "@/lib/house-design-data";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { canViewFullDesignImages } from "@/lib/server/account-terms";
import { syncCompletedProjectDesigns } from "@/lib/server/completed-project-designs";
import { houseDesignInputSchema, toHouseDesignDto } from "@/lib/server/house-designs";
import { MaintenanceError } from "@/lib/server/maintenance";
import { requireProfessionalId } from "@/lib/server/professionals";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await readSession();
    const scope = new URL(request.url).searchParams.get("scope");

    if (scope === "all" && !session) {
      return unauthorized();
    }

    if (scope === "all" && session?.role !== "admin") {
      return forbidden();
    }

    const db = await getDatabase();
    if (scope === "all" && session) await syncCompletedProjectDesigns(db, session);
    const documents = await db
      .collection<HouseDesignDocument>(collections.houseDesigns)
      .find(scope === "all" ? {} : { status: "Published" })
      .sort({ createdAt: -1 })
      .toArray();

    // Without staff access or accepted Terms and Conditions, only each
    // design's cover image is sent, so the full gallery cannot be scraped.
    const fullImages = await canViewFullDesignImages(db, session);
    const designs = documents.map((document) => toHouseDesignDto(document, { includeSource: scope === "all" })).map((design) =>
      fullImages ? design : { ...design, images: design.images.slice(0, 1) },
    );
    return NextResponse.json(
      { designs, imagesRestricted: !fullImages },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const { designedBy, ...input } = houseDesignInputSchema.parse(await request.json());
    const db = await getDatabase();
    const now = new Date();
    const document: HouseDesignDocument = {
      _id: new ObjectId(),
      ...input,
      ...(designedBy ? { designedBy: await requireProfessionalId(db, designedBy) } : {}),
      rooms: formatRoomSetup(input.bedrooms, input.bathrooms),
      createdAt: now,
      createdBy: new ObjectId(session.id),
      createdByName: session.name,
      updatedAt: now,
    };

    await db.collection<HouseDesignDocument>(collections.houseDesigns).insertOne(document);
    await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
      _id: new ObjectId(),
      actorId: new ObjectId(session.id),
      actorName: session.name,
      actorRole: session.role,
      action: "house-design.created",
      entityType: "house_design",
      entityId: document._id,
      details: { name: document.name, status: document.status },
      createdAt: now,
    });

    return NextResponse.json({ design: toHouseDesignDto(document, { includeSource: true }) }, { status: 201 });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
