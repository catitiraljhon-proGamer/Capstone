import { type Db, MongoServerError, ObjectId } from "mongodb";
import { z } from "zod";
import {
  accountTerms,
  termsText,
  type AccountTermsAcceptance,
  type AccountTermsContent,
  type AccountTermsView,
} from "@/lib/account-terms";
import { termsContentSchema, type TermsContentInput } from "@/lib/account-terms-schema";
import { collections, type AuditLogDocument, type TermsDocument, type UserDocument } from "@/lib/database/collections";
import { recordAuditLog } from "@/lib/server/audit";
import { BillingError } from "@/lib/server/billing";
import { MaintenanceError } from "@/lib/server/maintenance";
import type { SessionUser } from "@/types/domain";

const acceptanceAction = "account.terms-accepted";
const termsId = "terms";
const termsCollection = (db: Db) => db.collection<TermsDocument>(collections.systemSettings);
const currentTermsMessage = "Read and agree to the current Terms and Conditions before continuing.";

/** The version a registration form or Google sign-up agreed to; requireCurrentTerms checks it is the current one. */
export const termsVersionSchema = z
  .string({ error: currentTermsMessage })
  .trim()
  .min(1, currentTermsMessage)
  .max(40, currentTermsMessage);

async function publishedVersions(db: Db) {
  return (await termsCollection(db).findOne({ _id: termsId }))?.versions ?? [];
}

/** The terms customers agree to now: the Admin's latest published version, or the built-in terms. */
export async function getCurrentTerms(db: Db): Promise<AccountTermsContent> {
  return (await publishedVersions(db)).at(-1)?.terms ?? accountTerms;
}

/** Only the current version can be agreed to; a form opened before the Admin published a newer one is read again. */
export async function requireCurrentTerms(db: Db, version: string) {
  const terms = await getCurrentTerms(db);
  z.object({ termsVersion: z.literal(terms.version, { error: currentTermsMessage }) }).parse({ termsVersion: version });
  return terms;
}

/**
 * Saves the customer's agreement once: the audit log keeps the exact text, and the account keeps a pointer so the
 * terms are never asked again, even after the Admin publishes a newer version. Returns the existing agreement if one
 * is already on file.
 */
export async function recordAccountTerms(
  db: Db, user: Pick<SessionUser, "id" | "name" | "role">, terms: AccountTermsContent, now = new Date(),
) {
  const users = db.collection<UserDocument>(collections.users);
  const existing = await users.findOne({ _id: new ObjectId(user.id) }, { projection: { termsAcceptance: 1 } });
  if (existing?.termsAcceptance) return existing.termsAcceptance;
  const { acceptance, auditLog } = accountTermsRecords(user, terms, now);
  const saved = await users.updateOne(
    { _id: new ObjectId(user.id), termsAcceptance: { $exists: false } },
    { $set: { termsAcceptance: acceptance } },
  );
  if (!saved.matchedCount) {
    const current = await users.findOne({ _id: new ObjectId(user.id) }, { projection: { termsAcceptance: 1 } });
    if (current?.termsAcceptance) return current.termsAcceptance;
    throw new BillingError("Account not found.", 404);
  }
  await db.collection<AuditLogDocument>(collections.auditLogs).insertOne(auditLog);
  return acceptance;
}

/** The account pointer and the audit record (with the exact terms text) for one agreement, saved together. */
export function accountTermsRecords(user: Pick<SessionUser, "id" | "name" | "role">, terms: AccountTermsContent, now: Date) {
  const auditLogId = new ObjectId();
  const auditLog: AuditLogDocument = {
    _id: auditLogId, actorId: new ObjectId(user.id), actorName: user.name, actorRole: user.role,
    action: acceptanceAction, entityType: "account_terms", entityId: new ObjectId(user.id),
    details: { accepted: true, termsVersion: terms.version, acknowledgment: terms.acknowledgment, termsSnapshot: termsText(terms) },
    createdAt: now,
  };
  return { acceptance: { auditLogId, version: terms.version, acceptedAt: now }, auditLog };
}

const acceptanceSchema = z.object({ accepted: z.literal(true), version: termsVersionSchema }).strict();

export async function acceptAccountTerms(db: Db, actor: SessionUser, raw: unknown): Promise<AccountTermsAcceptance> {
  if (actor.role !== "customer") throw new BillingError("Only customers agree to the customer Terms and Conditions.", 403);
  const input = acceptanceSchema.parse(raw);
  const acceptance = await recordAccountTerms(db, actor, await requireCurrentTerms(db, input.version));
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

export async function getAccountTermsView(db: Db): Promise<AccountTermsView> {
  const versions = await publishedVersions(db);
  return {
    current: versions.at(-1)?.terms ?? accountTerms,
    versions: [
      ...versions.map((item) => ({ version: item.terms.version, publishedBy: item.publishedBy, publishedAt: item.publishedAt.toISOString() })).reverse(),
      { version: accountTerms.version, publishedBy: null, publishedAt: null },
    ],
  };
}

/** One published version, or the built-in terms, for the Admin to read again. */
export async function getAccountTermsVersion(db: Db, version: string) {
  const terms = version === accountTerms.version
    ? accountTerms
    : (await publishedVersions(db)).find((item) => item.terms.version === version)?.terms;
  if (!terms) throw new MaintenanceError("That version of the Terms and Conditions was not found.", 404);
  return terms;
}

/** Versions are dated in Philippine time; a second version on the same day becomes "2026-10-24.2", and so on. */
function nextVersion(taken: string[], now: Date) {
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  if (!taken.includes(date)) return date;
  let count = 2;
  while (taken.includes(`${date}.${count}`)) count += 1;
  return `${date}.${count}`;
}

function sameContent(input: TermsContentInput, terms: AccountTermsContent) {
  const { title, introduction, noticeTitle, notice, sections, cases, acknowledgment } = terms;
  const current = termsContentSchema.parse({ title, introduction, noticeTitle, notice, sections, cases, acknowledgment });
  return JSON.stringify(input) === JSON.stringify(current);
}

/**
 * Publishes the edited terms as a new version that new sign-ups agree to. Earlier versions stay unchanged, and
 * customers who already agreed keep their agreement.
 */
export async function publishAccountTerms(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can publish the Terms and Conditions.", 403);
  const input = termsContentSchema.parse(raw);
  const versions = await publishedVersions(db);
  if (sameContent(input, versions.at(-1)?.terms ?? accountTerms)) {
    throw new MaintenanceError("Nothing has changed. Edit the terms before publishing a new version.");
  }
  const terms: AccountTermsContent = {
    version: nextVersion([accountTerms.version, ...versions.map((item) => item.terms.version)], now),
    ...input,
  };
  try {
    // Matches only while no one else has published since this read, so a version is never lost.
    await termsCollection(db).updateOne(
      { _id: termsId, versions: { $size: versions.length } },
      {
        $push: { versions: { terms, publishedById: new ObjectId(actor.id), publishedBy: actor.name, publishedAt: now } },
        $set: { updatedAt: now },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new MaintenanceError("Another version was just published. Reload the page to see it, then make your changes again.", 409);
    }
    throw error;
  }
  await recordAuditLog({
    db, actor, action: "Published Terms and Conditions", entityType: "System", createdAt: now,
    details: { Version: terms.version, termsSnapshot: termsText(terms) },
  });
  return getAccountTermsView(db);
}
