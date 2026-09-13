import {
  collections,
  type ApprovalDocument,
  type DesignRequestDocument,
  type EstimateDocument,
} from "@/lib/database/collections";
import type { ApprovalRecordType } from "@/types/approvals";
import { type Db, ObjectId } from "mongodb";

export function makeApprovalReference(recordId: ObjectId, createdAt: Date) {
  return `APR-${createdAt.getUTCFullYear()}-${recordId
    .toHexString()
    .slice(-8)
    .toUpperCase()}`;
}

export function makePendingApproval(input: {
  customerId: ObjectId;
  recordType: ApprovalRecordType;
  recordId: ObjectId;
  createdAt: Date;
}): ApprovalDocument {
  return {
    _id: new ObjectId(),
    reference: makeApprovalReference(input.recordId, input.createdAt),
    customerId: input.customerId,
    recordType: input.recordType,
    recordId: input.recordId,
    status: "Pending",
    createdAt: input.createdAt,
  };
}

/**
 * Backfills queue entries created before the Approvals module was connected.
 * The compound unique index keeps this safe to call from both the dashboard
 * and the full queue endpoint.
 */
export async function syncPendingWorkflowApprovals(db: Db) {
  const [designRequests, estimates] = await Promise.all([
    db
      .collection<DesignRequestDocument>(collections.designRequests)
      .find(
        { status: { $in: ["Pending", "In review"] } },
        { projection: { _id: 1, customerId: 1, createdAt: 1 } },
      )
      .toArray(),
    db
      .collection<EstimateDocument>(collections.estimates)
      .find(
        { status: "Pending" },
        { projection: { _id: 1, customerId: 1, createdAt: 1 } },
      )
      .toArray(),
  ]);

  const pendingSources = [
    ...designRequests.map((record) => ({
      customerId: record.customerId,
      recordType: "Design request" as const,
      recordId: record._id,
      createdAt: record.createdAt,
    })),
    ...estimates.map((record) => ({
      customerId: record.customerId,
      recordType: "Cost estimate" as const,
      recordId: record._id,
      createdAt: record.createdAt,
    })),
  ];

  if (pendingSources.length === 0) return;

  await db.collection<ApprovalDocument>(collections.approvals).bulkWrite(
    pendingSources.map((source) => {
      const approval = makePendingApproval(source);
      return {
        updateOne: {
          filter: {
            recordType: source.recordType,
            recordId: source.recordId,
          },
          update: { $setOnInsert: approval },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );
}
