import { MongoServerError, ObjectId, type Db } from "mongodb";
import { z } from "zod";
import {
  collections,
  type ExteriorItemDocument,
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
const optionSchema = z.object({
  name: z.string().trim().min(1, "Enter the material name.").max(120),
  unit: z.string().trim().min(1, "Enter the unit.").max(20),
  unitPrice: z.number().finite().nonnegative().max(10_000_000).multipleOf(0.01, "Use no more than two decimal places."),
  quantity: z.number().finite().positive().max(100_000).optional(),
}).strict();

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
    action: z.literal("save-exterior-item"),
    id: recordIdSchema.optional(),
    item: z.string().trim().min(2, "Enter the item name.").max(80),
    detail: z.string().trim().max(200),
    quantity: z.number().finite().positive().max(100_000).optional(),
    quantityByArea: z.number().finite().positive().max(100).optional(),
    options: z.array(optionSchema).min(1, "Add at least one material option.").max(20)
      .refine((options) => new Set(options.map((option) => option.name.toLowerCase())).size === options.length, "Each material option needs a different name."),
    active: z.boolean(),
  }).strict().refine((input) => Boolean(input.quantity) !== Boolean(input.quantityByArea), "Set either a fixed quantity or a quantity per sqm of floor area."),
  z.object({
    action: z.literal("move"),
    kind: z.enum(["finish", "house-type", "exterior-item"]),
    id: recordIdSchema,
    direction: z.enum(["up", "down"]),
  }).strict(),
]);

const finishes = (db: Db) => db.collection<ReferenceValueDocument>(collections.referenceValues);
const houseTypes = (db: Db) => db.collection<HouseTypeDocument>(collections.houseTypes);
const exteriorItems = (db: Db) => db.collection<ExteriorItemDocument>(collections.exteriorItems);
const houseDesigns = (db: Db) => db.collection<HouseDesignDocument>(collections.houseDesigns);

export async function getMaintenanceData(db: Db): Promise<MaintenanceData> {
  const [finishDocs, typeDocs, itemDocs, designs] = await Promise.all([
    finishes(db).find({ category: finishCategory }).sort({ order: 1 }).toArray(),
    houseTypes(db).find({}).sort({ order: 1 }).toArray(),
    exteriorItems(db).find({}).sort({ order: 1 }).toArray(),
    houseDesigns(db).find({}, { projection: { finish: 1, houseType: 1 } }).toArray(),
  ]);
  const count = (key: "finish" | "houseType", value: string) => designs.filter((design) => design[key] === value).length;
  return {
    finishes: finishDocs.map((doc) => ({ id: doc._id.toHexString(), value: doc.value, active: doc.active, designCount: count("finish", doc.value) })),
    houseTypes: typeDocs.map((doc) => ({
      id: doc._id.toHexString(), heading: doc.heading, description: doc.description, imgSrc: doc.imgSrc, active: doc.active,
      designCount: count("houseType", doc.heading),
    })),
    exteriorItems: itemDocs.map((doc) => ({
      id: doc._id.toHexString(), item: doc.item, detail: doc.detail, quantity: doc.quantity, quantityByArea: doc.quantityByArea,
      options: doc.options, active: doc.active,
    })),
  };
}

export const inactiveFinishMessage = "Choose one of the available finish levels.";

/** New design requests and house designs may only use a finish that is currently offered. */
export async function isActiveFinish(db: Db, finish: string) {
  return Boolean(await finishes(db).findOne({ category: finishCategory, value: finish, active: true }, { projection: { _id: 1 } }));
}

type ActiveItem = { id: string; options: string[] };

async function activeExteriorItems(db: Db): Promise<ActiveItem[]> {
  const items = await exteriorItems(db).find({ active: true }, { projection: { options: 1 } }).sort({ order: 1 }).toArray();
  return items.map((item) => ({ id: item._id.toHexString(), options: item.options.map((option) => option.name) }));
}

/**
 * House designs store their default material choice per exterior item by list position. When the
 * active list or an item's options change, carry each choice over by item id and material name.
 */
async function remapDefaultSelections(db: Db, before: ActiveItem[], after: ActiveItem[]) {
  const unchanged = before.length === after.length && before.every((item, index) =>
    item.id === after[index].id && item.options.join("\u0000") === after[index].options.join("\u0000"));
  if (unchanged) return;
  const designs = await houseDesigns(db).find({}, { projection: { defaultSelections: 1 } }).toArray();
  const updates = designs.map((design) => {
    const chosen = new Map(before.map((item, index) => [item.id, item.options[design.defaultSelections?.[index] ?? 0]]));
    const defaultSelections = after.map((item) => Math.max(0, item.options.indexOf(chosen.get(item.id) ?? "")));
    return { updateOne: { filter: { _id: design._id }, update: { $set: { defaultSelections } } } };
  });
  if (updates.length) await houseDesigns(db).bulkWrite(updates);
}

async function nextOrder(db: Db, kind: MaintenanceKind) {
  const sort = { order: -1 as const };
  const last = kind === "finish"
    ? await finishes(db).findOne({ category: finishCategory }, { sort })
    : kind === "house-type" ? await houseTypes(db).findOne({}, { sort }) : await exteriorItems(db).findOne({}, { sort });
  return (last?.order ?? -1) + 1;
}

const collectionFor: Record<MaintenanceKind, string> = {
  finish: collections.referenceValues,
  "house-type": collections.houseTypes,
  "exterior-item": collections.exteriorItems,
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
      const before = input.kind === "exterior-item" ? await activeExteriorItems(db) : [];
      await move(db, input.kind, new ObjectId(input.id), input.direction);
      if (input.kind === "exterior-item") await remapDefaultSelections(db, before, await activeExteriorItems(db));
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

    if (input.action === "save-house-type") {
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
      return;
    }

    const id = input.id ? new ObjectId(input.id) : new ObjectId();
    const existing = input.id ? await exteriorItems(db).findOne({ _id: id }) : null;
    if (input.id && !existing) throw new MaintenanceError("This exterior item no longer exists. Refresh the page.", 404);
    const before = await activeExteriorItems(db);
    const fields = { item: input.item, detail: input.detail, options: input.options, active: input.active };
    // An item is priced either by a fixed quantity or by floor area, never both.
    const basis = input.quantity ? { quantity: input.quantity } : { quantityByArea: input.quantityByArea };
    const cleared = input.quantity ? "quantityByArea" : "quantity";
    if (existing) {
      await exteriorItems(db).updateOne({ _id: id }, { $set: { ...fields, ...basis }, $unset: { [cleared]: "" } });
      if (existing.item !== input.item) {
        await houseDesigns(db).updateMany(
          { "materialPrices.item": existing.item },
          { $set: { "materialPrices.$[price].item": input.item } },
          { arrayFilters: [{ "price.item": existing.item }] },
        );
      }
    } else {
      await exteriorItems(db).insertOne({ _id: id, ...fields, ...basis, order: await nextOrder(db, "exterior-item") });
    }
    await remapDefaultSelections(db, before, await activeExteriorItems(db));
    await audit(existing ? "Updated exterior item" : "Added exterior item", "Exterior item", id, { item: input.item, active: input.active });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new MaintenanceError("That name is already used. Choose a different name.", 409);
    throw error;
  }
}
