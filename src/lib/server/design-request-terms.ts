import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { collections, type AuditLogDocument } from "@/lib/database/collections";
import { designRequestTerms, designRequestTermsText, type DesignTermsAcceptance } from "@/lib/design-request-terms";
import { BillingError } from "@/lib/server/billing";
import type { SessionUser } from "@/types/domain";

const acceptanceSchema = z.object({
  accepted: z.literal(true),
  version: z.literal(designRequestTerms.version),
}).strict();

const acceptanceAction = "design-request.terms-accepted";

export async function acceptDesignRequestTerms(db: Db, actor: SessionUser, raw: unknown): Promise<DesignTermsAcceptance> {
  if (actor.role !== "customer") throw new BillingError("Only customers can accept design request terms.", 403);
  const input = acceptanceSchema.parse(raw);
  const now = new Date();
  const id = new ObjectId();
  await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
    _id: id,
    actorId: new ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role,
    action: acceptanceAction,
    entityType: "design_request_terms",
    details: {
      accepted: input.accepted,
      termsVersion: input.version,
      acknowledgment: designRequestTerms.acknowledgment,
      termsSnapshot: designRequestTermsText,
    },
    createdAt: now,
  });
  return { id: id.toHexString(), version: input.version, acceptedAt: now.toISOString() };
}

export async function requireDesignRequestTerms(db: Db, actor: SessionUser, acceptanceId: string) {
  if (actor.role !== "customer") throw new BillingError("Only customers can submit design requests.", 403);
  if (!/^[a-f\d]{24}$/i.test(acceptanceId)) {
    throw new BillingError("Please read and accept the Design Request Terms and Conditions first.", 400);
  }
  const acceptance = await db.collection<AuditLogDocument>(collections.auditLogs).findOne({
    _id: new ObjectId(acceptanceId),
    actorId: new ObjectId(actor.id),
    action: acceptanceAction,
    entityType: "design_request_terms",
    "details.accepted": true,
    "details.termsVersion": designRequestTerms.version,
  });
  if (!acceptance) {
    throw new BillingError("Please reopen Design Requests and accept the current Terms and Conditions.", 409);
  }
  return { auditLogId: acceptance._id, version: designRequestTerms.version, acceptedAt: acceptance.createdAt };
}
