import {
  collections,
  type AuditLogDocument,
} from "@/lib/database/collections";
import type { SessionUser } from "@/types/domain";
import { type Db, ObjectId } from "mongodb";

type AuditLogInput = {
  db: Db;
  actor: Pick<SessionUser, "id" | "name" | "role">;
  action: string;
  entityType: string;
  entityId?: ObjectId;
  details?: AuditLogDocument["details"];
  createdAt?: Date;
};

/**
 * Records a user-visible audit event. Call this only after the associated
 * operation succeeds so failed requests do not appear as completed actions.
 */
export async function recordAuditLog({
  db,
  actor,
  action,
  entityType,
  entityId,
  details,
  createdAt = new Date(),
}: AuditLogInput) {
  await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
    _id: new ObjectId(),
    actorId: new ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entityType,
    ...(entityId ? { entityId } : {}),
    ...(details && Object.keys(details).length > 0 ? { details } : {}),
    createdAt,
  });
}
