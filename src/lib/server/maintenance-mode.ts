import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { collections, type MaintenanceModeDocument } from "@/lib/database/collections";
import { formatMaintenanceEnd } from "@/lib/maintenance-mode";
import { recordAuditLog } from "@/lib/server/audit";
import { MaintenanceError } from "@/lib/server/maintenance";
import type { SessionUser } from "@/types/domain";
import type { MaintenanceModeStatus } from "@/types/maintenance";

const settingId = "maintenance-mode";
/** The proxy checks this on every customer and Billing Clerk request, so reads are briefly cached per server instance. */
const cacheMs = 15_000;

const changeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    minutes: z.number().int().min(15, "Maintenance lasts at least 15 minutes.").max(1440, "Maintenance can last up to 24 hours."),
    message: z.string().trim().max(300, "Keep the message under 300 characters.").optional(),
  }).strict(),
  z.object({
    action: z.literal("extend"),
    minutes: z.number().int().min(15).max(720),
  }).strict(),
  z.object({ action: z.literal("end") }).strict(),
]);

const cache = globalThis as typeof globalThis & { maintenanceMode?: { readAt: number; document: MaintenanceModeDocument | null } };
const settings = (db: Db) => db.collection<MaintenanceModeDocument>(collections.systemSettings);

function toStatus(document: MaintenanceModeDocument | null, now: Date): MaintenanceModeStatus {
  if (!document || document.endsAt <= now) return { active: false, endsAt: null, message: null, startedAt: null, startedByName: null };
  return {
    active: true,
    endsAt: document.endsAt.toISOString(),
    message: document.message ?? null,
    startedAt: document.startedAt.toISOString(),
    startedByName: document.startedByName,
  };
}

export async function readMaintenanceMode(db: Db, now = new Date(), { fresh = false } = {}): Promise<MaintenanceModeStatus> {
  const cached = cache.maintenanceMode;
  if (!fresh && cached && Date.now() - cached.readAt < cacheMs) return toStatus(cached.document, now);
  const document = await settings(db).findOne({ _id: settingId });
  cache.maintenanceMode = { readAt: Date.now(), document };
  return toStatus(document, now);
}

export async function changeMaintenanceMode(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can turn maintenance mode on or off.", 403);
  const input = changeSchema.parse(raw);
  const current = await readMaintenanceMode(db, now, { fresh: true });

  if (input.action === "start") {
    if (current.active) throw new MaintenanceError("Maintenance mode is already on. Extend it or end it instead.", 409);
    const endsAt = new Date(now.getTime() + input.minutes * 60_000);
    await settings(db).replaceOne({ _id: settingId }, {
      endsAt, ...(input.message ? { message: input.message } : {}),
      startedAt: now, startedById: new ObjectId(actor.id), startedByName: actor.name, updatedAt: now,
    }, { upsert: true });
    await recordAuditLog({
      db, actor, action: "Started maintenance mode", entityType: "System", createdAt: now,
      details: { minutes: input.minutes, endsAt: formatMaintenanceEnd(endsAt, now) },
    });
  } else {
    if (!current.active) throw new MaintenanceError("Maintenance mode is already off.", 409);
    const endsAt = input.action === "end" ? now : new Date(new Date(current.endsAt!).getTime() + input.minutes * 60_000);
    await settings(db).updateOne({ _id: settingId }, { $set: { endsAt, updatedAt: now } });
    await recordAuditLog({
      db, actor, entityType: "System", createdAt: now,
      action: input.action === "end" ? "Ended maintenance mode" : "Extended maintenance mode",
      details: input.action === "end" ? {} : { minutes: input.minutes, endsAt: formatMaintenanceEnd(endsAt, now) },
    });
  }
  return readMaintenanceMode(db, now, { fresh: true });
}
