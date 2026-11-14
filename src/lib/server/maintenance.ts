import type { Db } from "mongodb";
import { z } from "zod";
import { collections, type SystemSettingsDocument } from "@/lib/database/collections";
import { recordAuditLog } from "@/lib/server/audit";
import {
  defaultSystemSettings,
  passwordPolicyError,
  PasswordPolicyError,
  settingFields,
  settingKeys,
  type PublicSettings,
  type SettingKey,
  type SystemSettings,
  type SystemSettingsView,
} from "@/lib/system-settings";
import type { SessionUser } from "@/types/domain";

export class MaintenanceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const settingsId = "system";
const settingsCollection = (db: Db) => db.collection<SystemSettingsDocument>(collections.systemSettings);

const valueSchemas = Object.fromEntries(settingKeys.map((key) => {
  const field = settingFields[key];
  return [key, field.kind === "toggle"
    ? z.boolean()
    : z.number({ error: `Enter a number for ${field.label}.` }).int(`${field.label} must be a whole number.`)
      .min(field.min, `${field.label} must be at least ${field.min} ${field.unit}.`)
      .max(field.max, `${field.label} can be at most ${field.max} ${field.unit}.`)];
})) as unknown as Record<SettingKey, z.ZodType<number | boolean>>;

const updateSchema = z.object(valueSchemas).partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Change at least one setting.");

/** Saved values over the defaults; a value that no longer passes its limits falls back to the default. */
function withDefaults(saved: Partial<SystemSettings> | undefined): SystemSettings {
  const settings = { ...defaultSystemSettings };
  for (const key of settingKeys) {
    const value = saved?.[key];
    if (value !== undefined && valueSchemas[key].safeParse(value).success) (settings as Record<SettingKey, unknown>)[key] = value;
  }
  return settings;
}

export async function getSystemSettings(db: Db): Promise<SystemSettings> {
  return withDefaults((await settingsCollection(db).findOne({ _id: settingsId }))?.values);
}

export async function getSystemSettingsView(db: Db): Promise<SystemSettingsView> {
  const document = await settingsCollection(db).findOne({ _id: settingsId });
  const changes: SystemSettingsView["changes"] = {};
  for (const [key, change] of Object.entries(document?.changes ?? {})) {
    if (change) changes[key as SettingKey] = { by: change.by, at: change.at.toISOString() };
  }
  return { settings: withDefaults(document?.values), changes };
}

export async function getPublicSettings(db: Db): Promise<PublicSettings> {
  const { passwordMinLength, passwordLettersAndNumbers, passwordUpperAndSymbol, idleSignOutMinutes } = await getSystemSettings(db);
  return { passwordMinLength, passwordLettersAndNumbers, passwordUpperAndSymbol, idleSignOutMinutes };
}

function display(key: SettingKey, value: number | boolean) {
  const field = settingFields[key];
  if (field.kind === "toggle") return value ? "On" : "Off";
  return `${value} ${field.unit}`;
}

/** Saves the changed settings, stamps who changed each one, and audits "old → new" per setting. */
export async function updateSystemSettings(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change settings.", 403);
  const input = updateSchema.parse(raw) as Partial<SystemSettings>;
  const current = await getSystemSettings(db);
  const next = { ...current, ...input };
  if (next.inactiveNoticeDays >= next.inactiveArchiveDays) {
    throw new MaintenanceError("Warn inactive clients fewer days before archiving than the archive period itself.");
  }
  const changed = settingKeys.filter((key) => input[key] !== undefined && input[key] !== current[key]);
  if (!changed.length) return getSystemSettingsView(db);

  const set: Record<string, unknown> = {};
  for (const key of changed) {
    set[`values.${key}`] = next[key];
    set[`changes.${key}`] = { by: actor.name, at: now };
  }
  await settingsCollection(db).updateOne({ _id: settingsId }, { $set: { ...set, updatedAt: now } }, { upsert: true });
  await recordAuditLog({
    db, actor, action: "Updated settings", entityType: "System", createdAt: now,
    details: Object.fromEntries(changed.map((key) => [settingFields[key].label, `${display(key, current[key])} → ${display(key, next[key])}`])),
  });
  return getSystemSettingsView(db);
}

/** Checks a new password against the Admin's password rules before it is saved. */
export async function requirePasswordPolicy(db: Db, password: string) {
  const problem = passwordPolicyError(password, await getSystemSettings(db));
  if (problem) throw new PasswordPolicyError(problem);
}
