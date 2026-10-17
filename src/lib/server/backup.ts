import { compare } from "bcryptjs";
import { Binary, BSON, ObjectId, type Db, type Document } from "mongodb";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";
import { z } from "zod";
import { collections, type MaintenanceModeDocument, type UserDocument } from "@/lib/database/collections";
import { recordAuditLog } from "@/lib/server/audit";
import { BackupStorageError, listFiles, readFileData, removeFile, saveFile } from "@/lib/server/backup-storage";
import { getSystemSettings, MaintenanceError } from "@/lib/server/maintenance";
import { readMaintenanceMode } from "@/lib/server/maintenance-mode";
import type { SessionUser } from "@/types/domain";
import type { BackupChunk, BackupList, BackupRecord, BackupType } from "@/types/maintenance";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

type Actor = Pick<SessionUser, "id" | "name" | "role">;

/** Short-lived login throttles, sign-up codes, and half-uploaded files are not worth restoring. */
const skipped = new Set<string>([collections.rateLimits, collections.emailVerifications, collections.backupUploads]);
export const backupCollections = Object.values(collections).filter((name) => !skipped.has(name));
/** Collections older backups may still contain for features that were removed; they are ignored on restore. */
const retiredCollections = new Set(["house_types", "reference_values"]);

const systemActor: Actor = { id: "000000000000000000000000", name: "System (automatic)", role: "admin" };
const maintenanceModeId = "maintenance-mode";
/** Each download piece stays well under Vercel's 4.5 MB response limit once base64-encoded. */
const chunkBytes = 2_500_000;
const typeLabels: Record<BackupType, string> = {
  automatic: "Automatic", manual: "Manual", "before-restore": "Before restore", uploaded: "Uploaded",
};

// ───────────────────────── File names ─────────────────────────
// A backup's details live in its file name, so listing never has to open the files:
// 2026-10-17T00-30-00-000Z_manual_<base64url of who made it>.json.gz

const fileNamePattern = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_(automatic|manual|before-restore|uploaded)_([A-Za-z0-9_-]*)\.json\.gz$/;

function fileName(createdAt: Date, type: BackupType, createdBy: string) {
  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  return `${stamp}_${type}_${Buffer.from(createdBy).toString("base64url")}.json.gz`;
}

function toRecord(pathname: string, size: number): BackupRecord | null {
  const id = pathname.replace(/^backups\//, "");
  const match = fileNamePattern.exec(id);
  if (!match) return null;
  const [, stamp, type, by] = match;
  const iso = stamp.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/, "$1:$2:$3.$4");
  return { id, type: type as BackupType, createdAt: new Date(iso).toISOString(), createdBy: Buffer.from(by, "base64url").toString(), size };
}

const idSchema = z.string().regex(fileNamePattern, "Select a backup from the list.");

// ───────────────────────── Making backups ─────────────────────────

/** Every lasting collection in canonical Extended JSON, so ObjectIds and dates survive a restore; gzip-compressed. */
async function exportDatabase(db: Db, createdAt: Date) {
  const data: Record<string, unknown[]> = {};
  for (const name of backupCollections) {
    data[name] = [];
    for await (const document of db.collection(name).find({}).sort({ _id: 1 })) {
      data[name].push(BSON.EJSON.serialize(document, { relaxed: false }));
    }
  }
  const file = { system: "G4 Builders Inc", createdAt: createdAt.toISOString(), format: "MongoDB Extended JSON (canonical)", collections: data };
  return gzipAsync(JSON.stringify(file));
}

async function storeBackup(db: Db, actor: Actor, type: BackupType, data: Buffer, createdAt: Date) {
  const name = fileName(createdAt, type, actor.name);
  await saveFile(name, data);
  const record = toRecord(name, data.length)!;
  await recordAuditLog({
    db, actor, entityType: "System", createdAt,
    action: type === "uploaded" ? "Uploaded database backup" : "Created database backup",
    details: { type: typeLabels[type], file: name, sizeBytes: data.length },
  });
  return record;
}

export async function createBackup(db: Db, actor: Actor, type: Exclude<BackupType, "uploaded">, now = new Date()) {
  return storeBackup(db, actor, type, await exportDatabase(db, now), now);
}

export async function listBackups(): Promise<BackupRecord[]> {
  const records = (await listFiles()).map((file) => toRecord(file.pathname, file.size)).filter((record) => record !== null);
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The list for the Maintenance page; a storage problem is shown on the page instead of failing it. */
export async function backupList(): Promise<BackupList> {
  try {
    return { backups: await listBackups(), storageError: null };
  } catch (error) {
    if (error instanceof BackupStorageError) return { backups: [], storageError: error.message };
    throw error;
  }
}

/** Keeps only the newest automatic backups; manual, uploaded, and before-restore backups stay until deleted. */
export async function pruneAutomaticBackups(keep: number) {
  const automatic = (await listBackups()).filter((record) => record.type === "automatic");
  for (const record of automatic.slice(keep)) await removeFile(`backups/${record.id}`);
}

/** Daily job: one automatic backup when the Admin has them turned on, then old ones are pruned. */
export async function runDailyBackup(db: Db, now = new Date()) {
  const settings = await getSystemSettings(db);
  if (!settings.autoBackup) return { created: null };
  const record = await createBackup(db, systemActor, "automatic", now);
  await pruneAutomaticBackups(settings.keepAutomaticBackups);
  return { created: record.id };
}

async function requireBackup(rawId: unknown) {
  const id = idSchema.parse(rawId);
  const record = (await listBackups()).find((item) => item.id === id);
  if (!record) throw new MaintenanceError("This backup no longer exists. Refresh the list.", 404);
  return record;
}

/** One piece of a saved backup; the page joins the pieces into a .json.gz download. */
export async function readBackupChunk(rawId: unknown, rawIndex: unknown): Promise<BackupChunk> {
  const record = await requireBackup(rawId);
  const data = await readFileData(`backups/${record.id}`);
  const chunks = Math.max(1, Math.ceil(data.length / chunkBytes));
  const index = z.coerce.number().int().min(0).max(chunks - 1).parse(rawIndex);
  return { index, chunks, data: data.subarray(index * chunkBytes, (index + 1) * chunkBytes).toString("base64") };
}

export async function deleteBackup(db: Db, actor: Actor, rawId: unknown) {
  const record = await requireBackup(rawId);
  await removeFile(`backups/${record.id}`);
  await recordAuditLog({ db, actor, action: "Deleted database backup", entityType: "System", details: { type: typeLabels[record.type], file: record.id } });
}

// ───────────────────────── Uploading a backup file ─────────────────────────

const uploadSchema = z.object({
  uploadId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  index: z.number().int().min(0),
  total: z.number().int().min(1).max(200, "The backup file is too large to upload."),
  data: z.string().min(1).max(3_500_000),
}).strict().refine((value) => value.index < value.total, "Invalid upload piece.");

type BackupUploadDocument = { _id: string; uploadId: string; index: number; data: Binary; createdAt: Date };

/**
 * Receives a downloaded backup file in pieces (requests are size-limited). When the last piece arrives the file is
 * checked and added to the list as an "Uploaded" backup, ready to restore.
 */
export async function receiveBackupUpload(db: Db, actor: Actor, raw: unknown) {
  const input = uploadSchema.parse(raw);
  const uploads = db.collection<BackupUploadDocument>(collections.backupUploads);
  // Pieces left by an upload that was abandoned more than a day ago are cleared out.
  await uploads.deleteMany({ createdAt: { $lt: new Date(Date.now() - 86_400_000) } });
  await uploads.replaceOne(
    { _id: `${input.uploadId}:${input.index}` },
    { uploadId: input.uploadId, index: input.index, data: new Binary(Buffer.from(input.data, "base64")), createdAt: new Date() },
    { upsert: true },
  );
  const pieces = await uploads.find({ uploadId: input.uploadId }).sort({ index: 1 }).toArray();
  if (pieces.length < input.total) return { complete: false as const };

  try {
    let data = Buffer.concat(pieces.map((piece) => Buffer.from(piece.data.buffer)));
    // Accept both .json.gz (from this list) and plain .json files (older downloads).
    if (!(data[0] === 0x1f && data[1] === 0x8b)) data = await gzipAsync(data);
    await parseBackupFile(data);
    return { complete: true as const, backup: await storeBackup(db, actor, "uploaded", data, new Date()) };
  } finally {
    await uploads.deleteMany({ uploadId: input.uploadId });
  }
}

// ───────────────────────── Restoring ─────────────────────────

/** Opens and checks a backup file before anything is changed. Missing collections restore as empty. */
async function parseBackupFile(data: Buffer) {
  let parsed: unknown;
  try {
    parsed = JSON.parse((await gunzipAsync(data)).toString("utf8"));
  } catch {
    throw new MaintenanceError("This file is not a G4 Builders backup. Choose a backup downloaded from this system.");
  }
  const file = z.object({ system: z.literal("G4 Builders Inc"), collections: z.record(z.string(), z.array(z.unknown())) }).safeParse(parsed);
  if (!file.success) throw new MaintenanceError("This file is not a G4 Builders backup. Choose a backup downloaded from this system.");
  const unknown = Object.keys(file.data.collections).filter((name) => !retiredCollections.has(name) && !backupCollections.includes(name as never));
  if (unknown.length) throw new MaintenanceError(`This backup has records this system does not recognize (${unknown.join(", ")}).`);
  const documents = new Map<string, Document[]>();
  for (const name of backupCollections) {
    try {
      documents.set(name, (file.data.collections[name] ?? []).map((item) => BSON.EJSON.deserialize(item as Document, { relaxed: false }) as Document));
    } catch {
      throw new MaintenanceError(`This backup's ${name} records are damaged and cannot be restored.`);
    }
  }
  return documents;
}

const restoreSchema = z.object({ password: z.string().min(1, "Enter your password to confirm.").max(200) }).strict();

/**
 * Replaces every record with the chosen backup. A "Before restore" backup is saved first so it can be undone,
 * customers and Billing Clerks are paused by maintenance mode while it runs, and everyone is signed out after.
 */
export async function restoreBackup(db: Db, actor: SessionUser, rawId: unknown, raw: unknown, now = new Date()) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can restore a backup.", 403);
  const { password } = restoreSchema.parse(raw);
  const user = await db.collection<UserDocument>(collections.users).findOne({ _id: new ObjectId(actor.id), status: "active" });
  if (!user?.passwordHash) throw new MaintenanceError("Set a password for your account before restoring a backup.", 403);
  if (!(await compare(password, user.passwordHash))) throw new MaintenanceError("The password is incorrect.", 403);

  const record = await requireBackup(rawId);
  const documents = await parseBackupFile(await readFileData(`backups/${record.id}`));
  const safety = await createBackup(db, actor, "before-restore", now);

  const settings = db.collection<MaintenanceModeDocument>(collections.systemSettings);
  await settings.replaceOne({ _id: maintenanceModeId }, {
    endsAt: new Date(now.getTime() + 60 * 60_000), message: "A backup is being restored. The system will be back shortly.",
    startedAt: now, startedById: new ObjectId(actor.id), startedByName: actor.name, updatedAt: now,
  }, { upsert: true });
  await readMaintenanceMode(db, now, { fresh: true });

  try {
    for (const name of backupCollections) {
      const collection = db.collection(name);
      // Maintenance mode is part of the system settings but is controlled by this restore, not the backup.
      const keepMaintenance = name === collections.systemSettings;
      await collection.deleteMany(keepMaintenance ? { _id: { $ne: maintenanceModeId } } as Document : {});
      const items = (documents.get(name) ?? []).filter((item) => !keepMaintenance || item._id !== maintenanceModeId);
      for (let start = 0; start < items.length; start += 500) await collection.insertMany(items.slice(start, start + 500));
    }
    // Restored accounts may carry sessions from back then; everyone signs in again.
    await db.collection<UserDocument>(collections.users).updateMany({}, { $inc: { authVersion: 1 } });
  } catch (error) {
    console.error("Backup restore failed", { errorType: error instanceof Error ? error.name : "UnknownError" });
    throw new MaintenanceError(
      `The restore stopped partway, and maintenance mode is still on. Restore the "Before restore" backup from ${new Date(safety.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} to undo it.`,
      500,
    );
  }

  await settings.updateOne({ _id: maintenanceModeId }, { $set: { endsAt: new Date(), updatedAt: new Date() } });
  await readMaintenanceMode(db, new Date(), { fresh: true });
  // Written after the restore so the restore itself stays in the audit log.
  await recordAuditLog({
    db, actor, action: "Restored database backup", entityType: "System",
    details: { restored: `${typeLabels[record.type]} backup from ${record.createdAt}`, undoWith: safety.id },
  });
  return { restored: record.id, safetyBackup: safety.id };
}
