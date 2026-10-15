import { type Db, ObjectId } from "mongodb";
import { z } from "zod";
import { accountTerms, accountTermsText, type AccountTermsAcceptance } from "@/lib/account-terms";
import { collections, type AuditLogDocument, type UserDocument } from "@/lib/database/collections";
import { BillingError } from "@/lib/server/billing";
import type { SessionUser } from "@/types/domain";

const acceptanceAction = "account.terms-accepted";

/** The version a registration form or Google sign-up agreed to; only the current version is accepted. */
export const termsVersionSchema = z.literal(accountTerms.version, {
  error: "Read and agree to the current Terms and Conditions before continuing.",
});

/**
 * Saves the customer's agreement once: the audit log keeps the exact text, and the account keeps a pointer so the
 * terms are never asked again. Returns the existing agreement if one is already on file.
 */
export async function recordAccountTerms(
  db: Db, user: Pick<SessionUser, "id" | "name" | "role">, version: typeof accountTerms.version, now = new Date(),
) {
  const users = db.collection<UserDocument>(collections.users);
  const existing = await users.findOne({ _id: new ObjectId(user.id) }, { projection: { termsAcceptance: 1 } });
  if (existing?.termsAcceptance) return existing.termsAcceptance;
  const auditLogId = new ObjectId();
  const acceptance = { auditLogId, version, acceptedAt: now };
  const saved = await users.updateOne(
    { _id: new ObjectId(user.id), termsAcceptance: { $exists: false } },
    { $set: { termsAcceptance: acceptance } },
  );
  if (!saved.matchedCount) {
    const current = await users.findOne({ _id: new ObjectId(user.id) }, { projection: { termsAcceptance: 1 } });
    if (current?.termsAcceptance) return current.termsAcceptance;
    throw new BillingError("Account not found.", 404);
  }
  await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
    _id: auditLogId, actorId: new ObjectId(user.id), actorName: user.name, actorRole: user.role,
    action: acceptanceAction, entityType: "account_terms", entityId: new ObjectId(user.id),
    details: { accepted: true, termsVersion: version, acknowledgment: accountTerms.acknowledgment, termsSnapshot: accountTermsText },
    createdAt: now,
  });
  return acceptance;
}

const acceptanceSchema = z.object({ accepted: z.literal(true), version: termsVersionSchema }).strict();

export async function acceptAccountTerms(db: Db, actor: SessionUser, raw: unknown): Promise<AccountTermsAcceptance> {
  if (actor.role !== "customer") throw new BillingError("Only customers agree to the customer Terms and Conditions.", 403);
  const input = acceptanceSchema.parse(raw);
  const acceptance = await recordAccountTerms(db, actor, input.version);
  return { version: acceptance.version, acceptedAt: acceptance.acceptedAt.toISOString() };
}

export async function getAccountTermsAcceptance(db: Db, userId: string) {
  const user = await db.collection<UserDocument>(collections.users).findOne({ _id: new ObjectId(userId) }, { projection: { termsAcceptance: 1 } });
  return user?.termsAcceptance ?? null;
}

/** Customer actions that depend on the terms call this; it fails only for accounts that never agreed. */
export async function requireAccountTerms(db: Db, actor: SessionUser) {
  const acceptance = await getAccountTermsAcceptance(db, actor.id);
  if (!acceptance) throw new BillingError("Please read and agree to the Terms and Conditions first.", 409);
  return acceptance;
}

/** Staff always see full design galleries; customers once they have agreed to the terms. */
export async function canViewFullDesignImages(db: Db, session: SessionUser | null) {
  if (!session) return false;
  if (session.role !== "customer") return true;
  return Boolean(await getAccountTermsAcceptance(db, session.id));
}
