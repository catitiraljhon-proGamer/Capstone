import { collections, type AuditLogDocument } from "@/lib/database/collections";
import {
  finishedDesignsTerms,
  finishedDesignsTermsText,
} from "@/lib/finished-designs-terms";
import { BillingError } from "@/lib/server/billing";
import type { SessionUser } from "@/types/domain";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";

const acceptanceSchema = z
  .object({
    accepted: z.literal(true),
    version: z.literal(finishedDesignsTerms.version),
  })
  .strict();

const acceptanceAction = "finished-designs.terms-accepted";
const acceptanceEntity = "finished_designs_terms";

/** True once the customer has accepted the current version of the terms. */
export async function hasAcceptedFinishedDesignsTerms(db: Db, userId: string) {
  const acceptance = await db
    .collection<AuditLogDocument>(collections.auditLogs)
    .findOne(
      {
        actorId: new ObjectId(userId),
        action: acceptanceAction,
        entityType: acceptanceEntity,
        "details.accepted": true,
        "details.termsVersion": finishedDesignsTerms.version,
      },
      { projection: { _id: 1 } },
    );
  return Boolean(acceptance);
}

/** Staff always see full images; customers only after accepting the terms. */
export async function canViewFullDesignImages(db: Db, session: SessionUser | null) {
  if (!session) return false;
  if (session.role !== "customer") return true;
  return hasAcceptedFinishedDesignsTerms(db, session.id);
}

export async function acceptFinishedDesignsTerms(
  db: Db,
  actor: SessionUser,
  raw: unknown,
) {
  if (actor.role !== "customer") {
    throw new BillingError("Only customers can accept the Finished Designs terms.", 403);
  }
  const input = acceptanceSchema.parse(raw);
  const now = new Date();
  await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
    _id: new ObjectId(),
    actorId: new ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role,
    action: acceptanceAction,
    entityType: acceptanceEntity,
    details: {
      accepted: input.accepted,
      termsVersion: input.version,
      acknowledgment: finishedDesignsTerms.acknowledgment,
      termsSnapshot: finishedDesignsTermsText,
    },
    createdAt: now,
  });
  return { version: input.version, acceptedAt: now.toISOString() };
}
