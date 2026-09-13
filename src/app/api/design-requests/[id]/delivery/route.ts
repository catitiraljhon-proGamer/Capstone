import {
  collections,
  type ApprovalDocument,
  type DesignRequestDocument,
  type NotificationDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { embeddedImagesSchema } from "@/lib/server/embedded-images";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

const deliverySchema = z.object({
  images: embeddedImagesSchema,
});

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
      return NextResponse.json(
        { error: "The selected design request is invalid." },
        { status: 400 },
      );
    }

    const input = deliverySchema.parse(await request.json());
    const db = await getDatabase();
    const requestId = new ObjectId(id);
    const designRequests = db.collection<DesignRequestDocument>(
      collections.designRequests,
    );
    const designRequest = await designRequests.findOne({ _id: requestId });

    if (!designRequest) {
      return NextResponse.json(
        { error: "Design request not found." },
        { status: 404 },
      );
    }
    if (designRequest.status === "Completed") {
      return NextResponse.json(
        { error: "The completed design was already sent to the client." },
        { status: 409 },
      );
    }
    if (designRequest.status !== "Approved") {
      return NextResponse.json(
        { error: "Approve the design request before sending completed work." },
        { status: 409 },
      );
    }

    const approval = await db
      .collection<ApprovalDocument>(collections.approvals)
      .findOne({
        recordType: "Design request",
        recordId: requestId,
        customerId: designRequest.customerId,
        status: "Approved",
      });

    if (!approval) {
      return NextResponse.json(
        { error: "The connected feasibility approval could not be verified." },
        { status: 409 },
      );
    }

    const now = new Date();
    const updated = await designRequests.findOneAndUpdate(
      { _id: requestId, status: "Approved" },
      {
        $set: {
          completedDesignImages: input.images,
          status: "Completed",
          completedAt: now,
          completedBy: new ObjectId(session.id),
          completedByName: session.name,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );

    if (!updated) {
      return NextResponse.json(
        { error: "This design request was updated by another administrator." },
        { status: 409 },
      );
    }

    await Promise.all([
      db
        .collection<NotificationDocument>(collections.notifications)
        .insertOne({
          _id: new ObjectId(),
          userId: designRequest.customerId,
          title: "Your house design is ready",
          body: `${session.name} completed the design for ${approval.reference}. Open your design requests to review and download it.`,
          href: "/customer/design-requests",
          kind: "design-request-completed",
          entityId: requestId,
          createdAt: now,
        }),
      recordAuditLog({
        db,
        actor: session,
        action: "design-request.completed",
        entityType: "design_request",
        entityId: requestId,
        details: {
          approvalReference: approval.reference,
          customerId: designRequest.customerId.toHexString(),
          deliveredImageCount: input.images.length,
        },
        createdAt: now,
      }),
    ]);

    return NextResponse.json({
      request: {
        id: updated._id.toHexString(),
        status: updated.status,
        completedDesignImages: updated.completedDesignImages,
        completedAt: updated.completedAt?.toISOString(),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
