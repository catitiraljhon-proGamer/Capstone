import { type ClientSession, type Db, MongoServerError, ObjectId } from "mongodb";
import { z } from "zod";
import { collections, type MaterialDocument, type MaterialsSeedDocument } from "@/lib/database/collections";
import { type Material, materialNameKey, materialNameMax, maxMaterialPrice } from "@/lib/materials";
import { recordAuditLog } from "@/lib/server/audit";
import { MaintenanceError } from "@/lib/server/maintenance";
import type { SessionUser } from "@/types/domain";
import startingList from "../../../database/seeds/materials.json";

const startingMaterials = startingList as { name: string; price: number }[];
const seededId = "materials-seeded";
const materialsCollection = (db: Db) => db.collection<MaterialDocument>(collections.materials);
const peso = (value: number) => value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });

const priceSchema = z.number({ error: "Enter the price as a number." })
  .finite()
  .positive("Price must be more than ₱0.")
  .max(maxMaterialPrice, "Price must be ₱10,000,000 or less.")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, "Use at most 2 decimal places.");

const createSchema = z.object({
  name: z.string().trim().min(2, "Material name must be at least 2 characters.").max(materialNameMax, "Keep the material name within 120 characters."),
  price: priceSchema,
}).strict();

const pricesSchema = z.object({
  prices: z.array(z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i, "Choose a material from the list."),
    price: priceSchema,
  }).strict()).min(1, "Change at least one price.").max(500),
}).strict();

function requireAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change materials.", 403);
}

/** The first read adds G4's starting list once. After that the Admin's list is kept as it is. */
async function addStartingMaterials(db: Db) {
  const marker = await db.collection<MaterialsSeedDocument>(collections.systemSettings)
    .updateOne({ _id: seededId }, { $setOnInsert: { seededAt: new Date() } }, { upsert: true });
  if (!marker.upsertedCount || (await materialsCollection(db).estimatedDocumentCount()) > 0) return;
  const now = new Date();
  await materialsCollection(db).insertMany(startingMaterials.map(({ name, price }) => ({
    _id: new ObjectId(), name, nameKey: materialNameKey(name), price, createdAt: now, updatedAt: now,
  })));
}

const toMaterial = (document: MaterialDocument): Material => ({
  id: document._id.toHexString(),
  name: document.name,
  price: document.price,
  createdAt: document.createdAt.toISOString(),
  priceChange: document.priceChange
    ? { by: document.priceChange.byName, at: document.priceChange.at.toISOString(), previousPrice: document.priceChange.previousPrice }
    : null,
});

/** In the order they were added, G4's starting list first. */
async function readMaterials(db: Db) {
  await addStartingMaterials(db);
  return (await materialsCollection(db).find().sort({ createdAt: 1, _id: 1 }).toArray()).map(toMaterial);
}

/** Every material with its price, for Maintenance and the estimate editor. */
export async function getMaterials(db: Db, actor: SessionUser) {
  requireAdmin(actor);
  return readMaterials(db);
}

/** Names only, for customers suggesting a different material; prices stay with G4 Builders. */
export async function getMaterialNames(db: Db) {
  return (await readMaterials(db)).map((material) => material.name);
}

/** The materials an estimate lists, by id. */
export async function findMaterials(db: Db, ids: ObjectId[], session?: ClientSession) {
  if (!ids.length) return new Map<string, MaterialDocument>();
  const documents = await materialsCollection(db).find({ _id: { $in: ids } }, { session }).toArray();
  return new Map(documents.map((document) => [document._id.toHexString(), document]));
}

export async function createMaterial(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  requireAdmin(actor);
  const input = createSchema.parse(raw);
  const name = input.name.replace(/\s+/g, " ");
  await addStartingMaterials(db);
  const document: MaterialDocument = { _id: new ObjectId(), name, nameKey: materialNameKey(name), price: input.price, createdAt: now, updatedAt: now };
  try {
    await materialsCollection(db).insertOne(document);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new MaintenanceError("This material is already on the list.", 409);
    throw error;
  }
  await recordAuditLog({
    db, actor, action: "Added a material", entityType: "Material", entityId: document._id, createdAt: now,
    details: { Material: name, Price: peso(input.price) },
  });
  return readMaterials(db);
}

/** Saves the prices typed in the list; only prices that differ from the saved ones change. */
export async function updateMaterialPrices(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  requireAdmin(actor);
  const { prices } = pricesSchema.parse(raw);
  if (new Set(prices.map((entry) => entry.id.toLowerCase())).size !== prices.length) {
    throw new MaintenanceError("Each material can be listed once.");
  }
  const current = await findMaterials(db, prices.map((entry) => new ObjectId(entry.id)));
  if (current.size !== prices.length) throw new MaintenanceError("A material was removed in the meantime. Reload the page and try again.", 409);
  const changed = prices.flatMap((entry) => {
    const document = current.get(entry.id.toLowerCase())!;
    return document.price === entry.price ? [] : [{ document, price: entry.price }];
  });
  if (changed.length) {
    await materialsCollection(db).bulkWrite(changed.map(({ document, price }) => ({
      updateOne: {
        filter: { _id: document._id },
        update: { $set: { price, updatedAt: now, priceChange: { byName: actor.name, at: now, previousPrice: document.price } } },
      },
    })));
    await recordAuditLog({
      db, actor, action: changed.length === 1 ? "Changed a material price" : "Changed material prices", entityType: "Material",
      ...(changed.length === 1 ? { entityId: changed[0].document._id } : {}), createdAt: now,
      details: {
        Changes: changed.slice(0, 10).map(({ document, price }) => `${document.name}: ${peso(document.price)} → ${peso(price)}`).join("; ")
          + (changed.length > 10 ? `; and ${changed.length - 10} more` : ""),
      },
    });
  }
  return readMaterials(db);
}
