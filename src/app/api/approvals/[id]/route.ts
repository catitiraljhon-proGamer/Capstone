import {
  collections,
  type ApprovalDocument,
  type DesignRequestDocument,
  type DocumentRecord,
  type EstimateDocument,
  type InvoiceDocument,
  type NotificationDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { readSession } from "@/lib/server/session";
import type { ApprovalRecordType } from "@/types/approvals";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

const decisionSchema = z
  .object({
    decision: z.enum(["Approved", "Rejected"]),
    note: z.string().trim().max(1_000).optional(),
  })
  .refine(
    (input) => input.decision !== "Rejected" || Boolean(input.note?.trim()),
    { message: "Add a reason before rejecting this approval.", path: ["note"] },
  );

const customerHrefs: Record<ApprovalRecordType, string> = {
  "Design request": "/customer/design-requests",
  "Cost estimate": "/customer/house-design",
  Billing: "/customer/billing",
  Document: "/customer/documents",
};

async function sourceExists(
  approval: ApprovalDocument,
  db: Awaited<ReturnType<typeof getDatabase>>,
) {
  const filter = {
    _id: approval.recordId,
    customerId: approval.customerId,
  };

  switch (approval.recordType) {
    case "Design request":
      return Boolean(
        await db
          .collection<DesignRequestDocument>(collections.designRequests)
          .findOne(filter, { projection: { _id: 1 } }),
      );
    case "Cost estimate":
      return Boolean(
        await db
          .collection<EstimateDocument>(collections.estimates)
          .findOne(filter, { projection: { _id: 1 } }),
      );
    case "Billing":
      return Boolean(
        await db
          .collection<InvoiceDocument>(collections.invoices)
          .findOne(filter, { projection: { _id: 1 } }),
      );
    case "Document":
      return Boolean(
        await db
          .collection<DocumentRecord>(collections.documents)
          .findOne(filter, { projection: { _id: 1 } }),
      );
  }
}

async function updateConnectedSource(
  approval: ApprovalDocument,
  decision: "Approved" | "Rejected",
  now: Date,
  db: Awaited<ReturnType<typeof getDatabase>>,
) {
  const filter = {
    _id: approval.recordId,
    customerId: approval.customerId,
  };

  switch (approval.recordType) {
    case "Design request":
      await db
        .collection<DesignRequestDocument>(collections.designRequests)
        .updateOne(filter, { $set: { status: decision, updatedAt: now } });
      return;
    case "Cost estimate":
      await db
        .collection<EstimateDocument>(collections.estimates)
        .updateOne(filter, { $set: { status: decision, updatedAt: now } });
      return;
    case "Billing":
      await db
        .collection<InvoiceDocument>(collections.invoices)
        .updateOne(filter, {
          $set: {
            status: decision === "Approved" ? "Ready" : "Draft",
            updatedAt: now,
          },
        });
      return;
    case "Document":
      return;
  }
}

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
        { error: "The selected approval is invalid." },
        { status: 400 },
      );
    }

    const input = decisionSchema.parse(await request.json());
    const db = await getDatabase();
    const approvals = db.collection<ApprovalDocument>(collections.approvals);
    const approvalId = new ObjectId(id);
    const existing = await approvals.findOne({ _id: approvalId });

    if (!existing) {
      return NextResponse.json(
        { error: "Approval record not found." },
        { status: 404 },
      );
    }
    if (existing.status !== "Pending") {
      return NextResponse.json(
        { error: `This approval was already ${existing.status.toLowerCase()}.` },
        { status: 409 },
      );
    }
    if (!(await sourceExists(existing, db))) {
      return NextResponse.json(
        {
          error:
            "The connected source record is missing. Restore it before reviewing this approval.",
        },
        { status: 409 },
      );
    }

    const now = new Date();
    const updated = await approvals.findOneAndUpdate(
      { _id: approvalId, status: "Pending" },
      {
        $set: {
          status: input.decision,
          reviewedAt: now,
          reviewedBy: new ObjectId(session.id),
          ...(input.note ? { reviewNote: input.note } : {}),
        },
      },
      { returnDocument: "after" },
    );

    if (!updated) {
      return NextResponse.json(
        { error: "This approval was reviewed by another administrator." },
        { status: 409 },
      );
    }

    await updateConnectedSource(existing, input.decision, now, db);

    const decisionLabel = input.decision.toLowerCase();
    const isFeasibleDesign =
      existing.recordType === "Design request" && input.decision === "Approved";
    await Promise.all([
      db
        .collection<NotificationDocument>(collections.notifications)
        .insertOne({
          _id: new ObjectId(),
          userId: existing.customerId,
          title: isFeasibleDesign
            ? "Design request approved as feasible"
            : `${existing.recordType} ${decisionLabel}`,
          body: isFeasibleDesign
            ? `${existing.reference} was approved as feasible by ${session.name}. Design work can now begin.${
                input.note ? ` Note: ${input.note}` : ""
              }`
            : `${existing.reference} was ${decisionLabel} by ${session.name}.${
                input.note ? ` Note: ${input.note}` : ""
              }`,
          href: customerHrefs[existing.recordType],
          kind: "approval-decision",
          entityId: existing._id,
          createdAt: now,
        }),
      recordAuditLog({
        db,
        actor: session,
        action: `approval.${decisionLabel}`,
        entityType: "approval",
        entityId: existing._id,
        details: {
          reference: existing.reference,
          recordType: existing.recordType,
          customerId: existing.customerId.toHexString(),
          ...(input.note ? { note: input.note } : {}),
        },
        createdAt: now,
      }),
    ]);

    return NextResponse.json({
      approval: {
        id: updated._id.toHexString(),
        status: updated.status,
        reviewedAt: updated.reviewedAt?.toISOString(),
        reviewedByName: session.name,
        reviewNote: updated.reviewNote,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
