import {
  collections,
  type ApprovalDocument,
  type DesignRequestDocument,
  type DocumentRecord,
  type EstimateDocument,
  type InvoiceDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { syncPendingWorkflowApprovals } from "@/lib/server/approvals";
import { readSession } from "@/lib/server/session";
import type { ApprovalDto, ApprovalRecordType } from "@/types/approvals";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

type ApprovalSource = Pick<
  ApprovalDto,
  | "subject"
  | "description"
  | "sourceStatus"
  | "sourceAvailable"
  | "inspirationImages"
  | "completedDesignImages"
  | "completedAt"
  | "amount"
>;

const missingSource: ApprovalSource = {
  subject: "Source record unavailable",
  description: "The connected workflow record could not be found.",
  sourceStatus: null,
  sourceAvailable: false,
};

function uniqueIds(approvals: ApprovalDocument[], recordType: ApprovalRecordType) {
  return approvals
    .filter((approval) => approval.recordType === recordType)
    .map((approval) => approval.recordId);
}

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const db = await getDatabase();
    await syncPendingWorkflowApprovals(db);

    const approvalCollection = db.collection<ApprovalDocument>(
      collections.approvals,
    );
    const [approvals, pending, approved, rejected] = await Promise.all([
      approvalCollection
        .find()
        .sort({ createdAt: -1, _id: -1 })
        .limit(500)
        .toArray(),
      approvalCollection.countDocuments({ status: "Pending" }),
      approvalCollection.countDocuments({ status: "Approved" }),
      approvalCollection.countDocuments({ status: "Rejected" }),
    ]);

    const customerIds = approvals.map((approval) => approval.customerId);
    const reviewerIds = approvals.flatMap((approval) =>
      approval.reviewedBy ? [approval.reviewedBy] : [],
    );
    const userIds = [
      ...new Set(
        [...customerIds, ...reviewerIds].map((userId) => userId.toHexString()),
      ),
    ].map((id) => new ObjectId(id));

    const [users, designRequests, estimates, invoices, documents] =
      await Promise.all([
        userIds.length
          ? db
              .collection<UserDocument>(collections.users)
              .find(
                { _id: { $in: userIds } },
                { projection: { name: 1, email: 1 } },
              )
              .toArray()
          : [],
        db
          .collection<DesignRequestDocument>(collections.designRequests)
          .find({
            _id: { $in: uniqueIds(approvals, "Design request") },
          })
          .toArray(),
        db
          .collection<EstimateDocument>(collections.estimates)
          .find({ _id: { $in: uniqueIds(approvals, "Cost estimate") } })
          .toArray(),
        db
          .collection<InvoiceDocument>(collections.invoices)
          .find({ _id: { $in: uniqueIds(approvals, "Billing") } })
          .toArray(),
        db
          .collection<DocumentRecord>(collections.documents)
          .find({ _id: { $in: uniqueIds(approvals, "Document") } })
          .toArray(),
      ]);

    const usersById = new Map(
      users.map((user) => [user._id.toHexString(), user]),
    );
    const sourcesByKey = new Map<string, ApprovalSource>();
    const sourceKey = (type: ApprovalRecordType, id: ObjectId) =>
      `${type}:${id.toHexString()}`;

    for (const source of designRequests) {
      sourcesByKey.set(sourceKey("Design request", source._id), {
        subject: `${source.floorArea.toLocaleString("en-PH")} sqm ${source.finish.toLowerCase()} design request`,
        description: `${source.rooms} — ${source.notes}`,
        sourceStatus: source.status,
        sourceAvailable: true,
        inspirationImages:
          source.inspirationImages ??
          (source.inspirationImage ? [source.inspirationImage] : []),
        completedDesignImages:
          source.completedDesignImages ??
          (source.completedDesignImage ? [source.completedDesignImage] : []),
        completedAt: source.completedAt?.toISOString(),
      });
    }
    for (const source of estimates) {
      sourcesByKey.set(sourceKey("Cost estimate", source._id), {
        subject: source.reference,
        description: "Saved construction cost estimate",
        sourceStatus: source.status,
        sourceAvailable: true,
        amount: source.total,
      });
    }
    for (const source of invoices) {
      sourcesByKey.set(sourceKey("Billing", source._id), {
        subject: source.invoiceNumber,
        description: `${source.label} — ${source.progressPercentage}% project progress`,
        sourceStatus: source.status,
        sourceAvailable: true,
        amount: source.amount,
      });
    }
    for (const source of documents) {
      sourcesByKey.set(sourceKey("Document", source._id), {
        subject: source.name,
        description: source.category,
        sourceStatus: null,
        sourceAvailable: true,
      });
    }

    return NextResponse.json({
      approvals: approvals.map((approval): ApprovalDto => {
        const customer = usersById.get(approval.customerId.toHexString());
        const reviewer = approval.reviewedBy
          ? usersById.get(approval.reviewedBy.toHexString())
          : undefined;
        const source =
          sourcesByKey.get(sourceKey(approval.recordType, approval.recordId)) ??
          missingSource;

        return {
          id: approval._id.toHexString(),
          reference: approval.reference,
          recordType: approval.recordType,
          recordId: approval.recordId.toHexString(),
          status: approval.status,
          customer: {
            id: approval.customerId.toHexString(),
            name: customer?.name ?? "Unknown client",
            email: customer?.email ?? "No email available",
          },
          ...source,
          createdAt: new Date(approval.createdAt).toISOString(),
          ...(approval.reviewedAt
            ? { reviewedAt: new Date(approval.reviewedAt).toISOString() }
            : {}),
          ...(reviewer ? { reviewedByName: reviewer.name } : {}),
          ...(approval.reviewNote ? { reviewNote: approval.reviewNote } : {}),
        };
      }),
      summary: {
        total: pending + approved + rejected,
        pending,
        approved,
        rejected,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
