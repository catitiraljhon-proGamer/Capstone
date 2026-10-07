import {
  collections,
  type AuditLogDocument,
  type HouseDesignDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { canViewFullDesignImages } from "@/lib/server/finished-designs-terms";
import { houseDesignInputSchema, toHouseDesignDto } from "@/lib/server/house-designs";
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
    const documents = await db
      .collection<HouseDesignDocument>(collections.houseDesigns)
      .find(scope === "all" ? {} : { status: "Published" })
      .sort({ createdAt: -1 })
      .toArray();

    // Without staff access or accepted Finished Designs terms, only each
    // design's cover image is sent, so the full gallery cannot be scraped.
    const fullImages = await canViewFullDesignImages(db, session);
    const designs = documents.map(toHouseDesignDto).map((design) =>
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

    const input = houseDesignInputSchema.parse(await request.json());
    const db = await getDatabase();
    const now = new Date();
    const document: HouseDesignDocument = {
      _id: new ObjectId(),
      ...input,
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

    return NextResponse.json({ design: toHouseDesignDto(document) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
