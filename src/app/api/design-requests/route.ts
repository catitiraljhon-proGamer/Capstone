import {
  collections,
  type ApprovalDocument,
  type DesignRequestDocument,
  type NotificationDocument,
  type ProjectDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { makePendingApproval } from "@/lib/server/approvals";
import { embeddedImagesSchema } from "@/lib/server/embedded-images";
import { customerDesignDto, listCustomerDesigns } from "@/lib/server/design-requests";
import { designRequestApi } from "@/lib/server/design-request-api";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

const inputSchema = z.object({
  floorArea: z.number().finite().positive().max(100_000),
  bedrooms: z.number().int().nonnegative(),
  bathrooms: z.number().int().nonnegative(),
  finish: z.enum(["Standard", "Semi-luxury", "Luxury"]),
  notes: z.string().trim().min(1).max(4_000),
  inspirationImages: embeddedImagesSchema,
});

export async function GET(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) => NextResponse.json({ requests: await listCustomerDesigns(db, actor) }));
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "customer") return forbidden();

    const input = inputSchema.parse(await request.json());
    const customerId = new ObjectId(session.id);
    const db = await getDatabase();
    const project = await db
      .collection<ProjectDocument>(collections.projects)
      .findOne(
        { customerId, status: { $in: ["Pending", "Active", "On hold"] } },
        { sort: { createdAt: -1 } },
      );
    const now = new Date();
    const document: DesignRequestDocument = {
      _id: new ObjectId(),
      customerId,
      projectId: project?._id,
      houseDesignId: project?.houseDesignId,
      ...input,
      rooms: `${input.bedrooms} bedroom${input.bedrooms === 1 ? "" : "s"}, ${input.bathrooms} bathroom${input.bathrooms === 1 ? "" : "s"}`,
      status: "Pending",
      createdAt: now,
      updatedAt: now,
    };

    await db
      .collection<DesignRequestDocument>(collections.designRequests)
      .insertOne(document);

    const approval = makePendingApproval({
      customerId,
      recordType: "Design request",
      recordId: document._id,
      createdAt: now,
    });
    await db
      .collection<ApprovalDocument>(collections.approvals)
      .insertOne(approval);

    const admins = await db
      .collection<UserDocument>(collections.users)
      .find(
        { role: "admin", status: "active" },
        { projection: { _id: 1 } },
      )
      .toArray();
    if (admins.length > 0) {
      await db
        .collection<NotificationDocument>(collections.notifications)
        .insertMany(
          admins.map((admin) => ({
            _id: new ObjectId(),
            userId: admin._id,
            title: "New design request",
            body: `${session.name} submitted a ${input.finish.toLowerCase()} design request with ${input.inspirationImages.length} inspiration image${input.inspirationImages.length === 1 ? "" : "s"} for ${input.floorArea.toLocaleString("en-PH")} sq m: ${input.notes.length > 120 ? `${input.notes.slice(0, 117)}…` : input.notes}`,
            href: "/admin/approvals",
            kind: "design-request",
            entityId: document._id,
            createdAt: now,
          })),
        );
    }

    await recordAuditLog({
      db,
      actor: session,
      action: "design-request.created",
      entityType: "design_request",
      entityId: document._id,
      details: {
        floorArea: document.floorArea,
        finish: document.finish,
        status: document.status,
        inspirationImageCount: input.inspirationImages.length,
      },
      createdAt: now,
    });

    return NextResponse.json({ request: await customerDesignDto(db, document) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
