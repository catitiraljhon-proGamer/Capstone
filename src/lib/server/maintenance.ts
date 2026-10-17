import { MongoServerError, ObjectId, type Db } from "mongodb";
import { z } from "zod";
import {
  collections,
  type HouseDesignDocument,
  type HouseTypeDocument,
  type ReferenceValueDocument,
} from "@/lib/database/collections";
import { recordAuditLog } from "@/lib/server/audit";
import { embeddedImageSchema } from "@/lib/server/embedded-images";
import type { SessionUser } from "@/types/domain";
import type { MaintenanceData, MaintenanceKind } from "@/types/maintenance";

export const finishCategory = "house-design-finish";

export class MaintenanceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const recordIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Select a valid record.");
const imageSchema = z.union([
  embeddedImageSchema,
  z.string().trim().url("Enter an image link or upload an image.").max(2_000).regex(/^https:\/\//, "Use an https:// image link."),
]);
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save-finish"),
    id: recordIdSchema.optional(),
    value: z.string().trim().min(2, "Enter the finish name.").max(40),
    active: z.boolean(),
  }).strict(),
  z.object({
    action: z.literal("save-house-type"),
    id: recordIdSchema.optional(),
    heading: z.string().trim().min(2, "Enter the house type name.").max(80),
    description: z.string().trim().min(10, "Describe the house type in at least 10 characters.").max(400),
    imgSrc: imageSchema,
    active: z.boolean(),
  }).strict(),
  z.object({
    action: z.literal("move"),
    kind: z.enum(["finish", "house-type"]),
    id: recordIdSchema,
    direction: z.enum(["up", "down"]),
  }).strict(),
]);

const finishes = (db: Db) => db.collection<ReferenceValueDocument>(collections.referenceValues);
const houseTypes = (db: Db) => db.collection<HouseTypeDocument>(collections.houseTypes);
const houseDesigns = (db: Db) => db.collection<HouseDesignDocument>(collections.houseDesigns);

export async function getMaintenanceData(db: Db): Promise<MaintenanceData> {
  const [finishDocs, typeDocs, designs] = await Promise.all([
    finishes(db).find({ category: finishCategory }).sort({ order: 1 }).toArray(),
    houseTypes(db).find({}).sort({ order: 1 }).toArray(),
    houseDesigns(db).find({}, { projection: { finish: 1, houseType: 1 } }).toArray(),
  ]);
  const count = (key: "finish" | "houseType", value: string) => designs.filter((design) => design[key] === value).length;
  return {
    finishes: finishDocs.map((doc) => ({ id: doc._id.toHexString(), value: doc.value, active: doc.active, designCount: count("finish", doc.value) })),
    houseTypes: typeDocs.map((doc) => ({
      id: doc._id.toHexString(), heading: doc.heading, description: doc.description, imgSrc: doc.imgSrc, active: doc.active,
      designCount: count("houseType", doc.heading),
    })),
  };
}

export const inactiveFinishMessage = "Choose one of the available finish levels.";

/** New design requests and house designs may only use a finish that is currently offered. */
export async function isActiveFinish(db: Db, finish: string) {
  return Boolean(await finishes(db).findOne({ category: finishCategory, value: finish, active: true }, { projection: { _id: 1 } }));
}

async function nextOrder(db: Db, kind: MaintenanceKind) {
  const sort = { order: -1 as const };
  const last = kind === "finish"
    ? await finishes(db).findOne({ category: finishCategory }, { sort })
    : await houseTypes(db).findOne({}, { sort });
  return (last?.order ?? -1) + 1;
}

const collectionFor: Record<MaintenanceKind, string> = {
  finish: collections.referenceValues,
  "house-type": collections.houseTypes,
};

async function move(db: Db, kind: MaintenanceKind, id: ObjectId, direction: "up" | "down") {
  const collection = db.collection<{ _id: ObjectId; order: number; category?: string }>(collectionFor[kind]);
  const records = await collection.find(kind === "finish" ? { category: finishCategory } : {}, { projection: { order: 1 } }).sort({ order: 1 }).toArray();
  const index = records.findIndex((record) => record._id.equals(id));
  if (index < 0) throw new MaintenanceError("This record no longer exists. Refresh the page.", 404);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= records.length) return;
  [records[index], records[swapWith]] = [records[swapWith], records[index]];
  // Rewrite positions so older records with duplicate orders end up in a clean sequence.
  await collection.bulkWrite(
    records.map((record, order) => ({ updateOne: { filter: { _id: record._id }, update: { $set: { order } } } })),
  );
}

export async function applyMaintenance(db: Db, actor: SessionUser, raw: unknown) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change maintenance records.", 403);
  const input = actionSchema.parse(raw);
  const audit = (action: string, entityType: string, entityId: ObjectId, details: Record<string, string | boolean>) =>
    recordAuditLog({ db, actor, action, entityType, entityId, details });

  try {
    if (input.action === "move") {
      await move(db, input.kind, new ObjectId(input.id), input.direction);
      return;
    }

    if (input.action === "save-finish") {
      const id = input.id ? new ObjectId(input.id) : new ObjectId();
      const existing = input.id ? await finishes(db).findOne({ _id: id, category: finishCategory }) : null;
      if (input.id && !existing) throw new MaintenanceError("This finish no longer exists. Refresh the page.", 404);
      if (existing) {
        await finishes(db).updateOne({ _id: id }, { $set: { value: input.value, active: input.active } });
        if (existing.value !== input.value) await houseDesigns(db).updateMany({ finish: existing.value }, { $set: { finish: input.value } });
      } else {
        await finishes(db).insertOne({ _id: id, category: finishCategory, value: input.value, active: input.active, order: await nextOrder(db, "finish") });
      }
      await audit(existing ? "Updated finish" : "Added finish", "Finish", id, { value: input.value, active: input.active });
      return;
    }

    const id = input.id ? new ObjectId(input.id) : new ObjectId();
    const existing = input.id ? await houseTypes(db).findOne({ _id: id }) : null;
    if (input.id && !existing) throw new MaintenanceError("This house type no longer exists. Refresh the page.", 404);
    const fields = { heading: input.heading, description: input.description, imgSrc: input.imgSrc, active: input.active };
    if (existing) {
      await houseTypes(db).updateOne({ _id: id }, { $set: fields });
      if (existing.heading !== input.heading) await houseDesigns(db).updateMany({ houseType: existing.heading }, { $set: { houseType: input.heading } });
    } else {
      await houseTypes(db).insertOne({ _id: id, ...fields, order: await nextOrder(db, "house-type") });
    }
    await audit(existing ? "Updated house type" : "Added house type", "House type", id, { heading: input.heading, active: input.active });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new MaintenanceError("That name is already used. Choose a different name.", 409);
    throw error;
  }
}
