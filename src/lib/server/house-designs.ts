import type { HouseDesign, HouseType } from "@/lib/house-design-data";
import {
  collections,
  type HouseDesignDocument,
  type HouseTypeDocument,
} from "@/lib/database/collections";
import defaultHouseTypes from "../../../database/seeds/house-types.json";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";

const customExteriorItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  item: z.string().trim().min(1).max(120),
  material: z.string().trim().min(1).max(160),
  unit: z.string().trim().min(1).max(30),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().nonnegative(),
});

const materialPricesSchema = z.array(z.object({
  item: z.string().trim().min(1).max(120),
  material: z.string().trim().min(1).max(160),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.number().finite().positive("Enter a unit price greater than 0.")
    .max(100_000_000, "Unit prices cannot exceed PHP 100,000,000.")
    .multipleOf(0.01, "Use no more than two decimal places for unit prices."),
}).strict()).max(300).refine((prices) => {
  const keys = prices.map(({ item, material, unit }) => JSON.stringify([item, material, unit]));
  return new Set(keys).size === keys.length;
}, "Each material option can have only one price.");

export const houseDesignInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  style: z.string().trim().max(80).optional(),
  houseType: z.string().trim().min(1, "Select a house type.").max(80),
  area: z.number().finite().positive().max(100_000),
  rooms: z.string().trim().min(1).max(200),
  rate: z.number().finite().nonnegative().max(100_000_000),
  images: z.array(z.string().min(1).max(2_100_000)).min(1).max(6),
  notes: z.string().trim().max(4_000),
  status: z.enum(["Draft", "Published", "Archived"]),
  defaultSelections: z.array(z.number().int().nonnegative()).max(100),
  materialPrices: materialPricesSchema.optional(),
  customItems: z.array(customExteriorItemSchema).max(100),
});

export const houseDesignPatchSchema = houseDesignInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be supplied.",
  });

/**
 * Active house types in their saved order. An empty collection (a new database, or a backup taken
 * while house types were turned off) is filled with the default types first.
 */
export async function listHouseTypes(db: Db): Promise<HouseType[]> {
  const houseTypes = db.collection<HouseTypeDocument>(collections.houseTypes);
  if ((await houseTypes.estimatedDocumentCount()) === 0) {
    await houseTypes.bulkWrite(
      defaultHouseTypes.map((houseType, order) => ({
        updateOne: {
          filter: { heading: houseType.heading },
          update: { $setOnInsert: { _id: new ObjectId(), ...houseType, order, active: true } },
          upsert: true,
        },
      })),
    );
  }
  const documents = await houseTypes.find({ active: true }).sort({ order: 1 }).toArray();
  await restoreMissingHouseTypes(db, documents.map((document) => document.heading));
  return documents.map(({ heading, description, imgSrc }) => ({ heading, description, imgSrc }));
}

const globalForHouseTypes = globalThis as typeof globalThis & { houseTypesRestored?: boolean };

/**
 * Designs saved while house types were turned off lost their type. Where the style label names a
 * house type (as on every seeded design), that type is put back; the rest stay unassigned for the Admin.
 */
async function restoreMissingHouseTypes(db: Db, headings: string[]) {
  if (globalForHouseTypes.houseTypesRestored) return;
  const designs = db.collection<HouseDesignDocument>(collections.houseDesigns);
  await Promise.all(headings.map((heading) =>
    designs.updateMany({ houseType: { $exists: false }, style: heading }, { $set: { houseType: heading } }),
  ));
  globalForHouseTypes.houseTypesRestored = true;
}

/** `includeSource` adds the completed-project record (client name and contract price); Admin only. */
export function toHouseDesignDto(
  document: HouseDesignDocument,
  { includeSource = false }: { includeSource?: boolean } = {},
): HouseDesign {
  const source = document.sourceProject;
  return {
    id: document._id.toHexString(),
    name: document.name,
    style: document.style,
    houseType: document.houseType,
    area: document.area,
    rooms: document.rooms,
    rate: document.rate,
    images: document.images,
    notes: document.notes,
    status: document.status,
    defaultSelections: document.defaultSelections,
    materialPrices: document.materialPrices ?? [],
    customItems: document.customItems,
    ...(includeSource && source
      ? {
          sourceProject: {
            projectId: source.projectId.toHexString(),
            projectReference: source.projectReference,
            estimateReference: source.estimateReference ?? null,
            customerName: source.customerName,
            contractPrice: source.contractPrice,
            subtotal: source.subtotal,
            completedAt: source.completedAt.toISOString(),
            lineItems: source.lineItems.map(({ item, description, unit, quantity, unitPrice, amount }) => ({
              item, description, unit, quantity, unitPrice, amount,
            })),
          },
        }
      : {}),
    createdAt: document.createdAt.toISOString(),
    createdBy: document.createdByName,
  };
}
