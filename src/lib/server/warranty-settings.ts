import type { Db } from "mongodb";
import { z } from "zod";
import { collections, type WarrantyListsDocument } from "@/lib/database/collections";
import { recordAuditLog } from "@/lib/server/audit";
import { MaintenanceError } from "@/lib/server/maintenance";
import { defaultWarrantyLists, warrantyLimits, type WarrantyLists, type WarrantyListsView } from "@/lib/warranty";
import type { SessionUser } from "@/types/domain";

const listsId = "warranty";
const listsCollection = (db: Db) => db.collection<WarrantyListsDocument>(collections.systemSettings);

const uniqueNames = (names: string[]) => new Set(names.map((name) => name.toLowerCase())).size === names.length;

const listsSchema = z.object({
  problemTypes: z.array(z.object({
    name: z.string().trim().min(2, "Enter a name for each problem type.")
      .max(warrantyLimits.problemTypeName, `Keep each problem type under ${warrantyLimits.problemTypeName} characters.`),
    shown: z.boolean(),
  }).strict())
    .min(1, "Keep at least one problem type.")
    .max(warrantyLimits.problemTypes, `Keep up to ${warrantyLimits.problemTypes} problem types.`)
    .refine((types) => uniqueNames(types.map((type) => type.name)), "Each problem type needs a different name.")
    .refine((types) => types.some((type) => type.shown), "Show at least one problem type, so customers can report a problem."),
  notCoveredReasons: z.array(
    z.string().trim().min(5, "Write each not-covered reason in a few words.")
      .max(warrantyLimits.notCoveredReason, `Keep each not-covered reason under ${warrantyLimits.notCoveredReason} characters.`),
  )
    .min(1, "Keep at least one not-covered reason.")
    .max(warrantyLimits.notCoveredReasons, `Keep up to ${warrantyLimits.notCoveredReasons} not-covered reasons.`)
    .refine(uniqueNames, "Each not-covered reason must be different."),
}).strict();

async function readLists(db: Db) {
  const saved = await listsCollection(db).findOne({ _id: listsId });
  const lists = listsSchema.safeParse(saved?.lists);
  return { saved: lists.success ? saved : null, lists: lists.success ? lists.data : defaultWarrantyLists };
}

/** The saved lists, or the built-in ones when nothing was saved or the saved lists no longer pass the rules. */
export async function getWarrantyLists(db: Db): Promise<WarrantyLists> {
  return (await readLists(db)).lists;
}

export async function getWarrantyListsView(db: Db, actor: SessionUser): Promise<WarrantyListsView> {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change the warranty settings.", 403);
  const { saved, lists } = await readLists(db);
  return { ...lists, changedBy: saved?.changedBy ?? null, changedAt: saved?.updatedAt.toISOString() ?? null };
}

/** Saves both lists and audits what was added, removed, hidden, or shown again. */
export async function updateWarrantyLists(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change the warranty settings.", 403);
  const lists = listsSchema.parse(raw);
  const { lists: current } = await readLists(db);
  const names = (types: WarrantyLists["problemTypes"]) => types.map((type) => type.name);
  const added = names(lists.problemTypes).filter((name) => !names(current.problemTypes).includes(name));
  const removed = names(current.problemTypes).filter((name) => !names(lists.problemTypes).includes(name));
  const toggled = lists.problemTypes.filter((type) => current.problemTypes.some((old) => old.name === type.name && old.shown !== type.shown));
  const reordered = !added.length && !removed.length && names(lists.problemTypes).join("\n") !== names(current.problemTypes).join("\n");
  const reasonsChanged = lists.notCoveredReasons.join("\n") !== current.notCoveredReasons.join("\n");
  const details: Record<string, string> = {
    ...(added.length ? { "Problem types added": added.join(", ") } : {}),
    ...(removed.length ? { "Problem types removed": removed.join(", ") } : {}),
    ...(toggled.length ? { "Problem types shown or hidden": toggled.map((type) => `${type.name}: ${type.shown ? "shown" : "hidden"}`).join(", ") } : {}),
    ...(reordered ? { "Problem types": "Reordered" } : {}),
    ...(reasonsChanged ? { "Not covered reasons": lists.notCoveredReasons.join("; ") } : {}),
  };
  if (!Object.keys(details).length) return getWarrantyListsView(db, actor);

  await listsCollection(db).updateOne(
    { _id: listsId },
    { $set: { lists, changedBy: actor.name, updatedAt: now } },
    { upsert: true },
  );
  await recordAuditLog({ db, actor, action: "Updated the warranty settings", entityType: "System", createdAt: now, details });
  return getWarrantyListsView(db, actor);
}
