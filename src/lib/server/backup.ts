import { BSON, ObjectId, type Db } from "mongodb";
import { collections } from "@/lib/database/collections";
import { recordAuditLog } from "@/lib/server/audit";
import type { SessionUser } from "@/types/domain";

/** Short-lived login throttles and sign-up codes are not worth restoring. */
const skipped = new Set<string>([collections.rateLimits, collections.emailVerifications]);
export const backupCollections = Object.values(collections).filter((name) => !skipped.has(name));

/** Keeps each response under Vercel's 4.5 MB limit; one large blueprint file still fits on its own. */
const pageBudget = 3_000_000;

export async function startBackup(db: Db, actor: SessionUser) {
  const counts = await Promise.all(backupCollections.map(async (name) => ({ name, count: await db.collection(name).estimatedDocumentCount() })));
  await recordAuditLog({ db, actor, action: "Downloaded database backup", entityType: "System", details: { collections: counts.length } });
  return { collections: counts };
}

/** One page of a collection in canonical Extended JSON, so ObjectIds and dates survive a restore. */
export async function backupPage(db: Db, name: string, after?: string) {
  const filter = after ? { _id: { $gt: new ObjectId(after) } } : {};
  const cursor = db.collection(name).find(filter).sort({ _id: 1 });
  const documents: unknown[] = [];
  let size = 0;
  let last: ObjectId | undefined;
  let hasMore = false;
  for await (const document of cursor) {
    const serialized = BSON.EJSON.serialize(document, { relaxed: false });
    const length = JSON.stringify(serialized).length;
    if (documents.length > 0 && size + length > pageBudget) {
      hasMore = true;
      break;
    }
    documents.push(serialized);
    size += length;
    last = document._id as ObjectId;
  }
  await cursor.close();
  return { documents, next: hasMore && last ? last.toHexString() : null };
}
