import type { HouseDesign, HouseType } from "@/lib/house-design-data";
import {
  collections,
  type HouseDesignDocument,
  type HouseTypeDocument,
} from "@/lib/database/collections";
import { maxRoomCount } from "@/lib/design-request-limit";
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

export const houseDesignInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  style: z.string().trim().max(80).optional(),
  houseType: z.string().trim().min(1, "Select a house type.").max(80),
  area: z.number().finite().positive().max(100_000),
  bedrooms: z.number().int().nonnegative().max(maxRoomCount, `Bedrooms cannot be more than ${maxRoomCount}.`),
  bathrooms: z.number().int().nonnegative().max(maxRoomCount, `Bathrooms cannot be more than ${maxRoomCount}.`),
  rate: z.number().finite().nonnegative().max(100_000_000),
  images: z.array(z.string().min(1).max(2_100_000)).min(1).max(6),
  notes: z.string().trim().max(4_000),
  status: z.enum(["Draft", "Published", "Archived"]),
  customItems: z.array(customExteriorItemSchema).max(100),
  /** The team member the design is credited to; null clears it. */
  designedBy: z.string().regex(/^[a-f0-9]{24}$/, "Choose who designed it from the list.").nullable().optional(),
});

export const houseDesignPatchSchema = houseDesignInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be supplied.",
  })
  // The readable room setup is rebuilt from both counts, so they are saved together.
  .refine((value) => (value.bedrooms === undefined) === (value.bathrooms === undefined), {
    message: "Send the number of bedrooms and bathrooms together.",
  });

/** Reads a count such as the 3 in "3 bedrooms, 2 toilets" from designs saved before the counts had their own fields. */
function countFromRoomSetup(rooms: string, pattern: RegExp) {
  const match = rooms.match(pattern);
  return match ? Number(match[1]) : 0;
}

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

/** True when the heading names a house type that is currently offered. */
export async function isActiveHouseType(db: Db, heading: string) {
  return (await listHouseTypes(db)).some((houseType) => houseType.heading === heading);
}

const globalForHouseTypes =globalThis as typeof globalThis & { houseTypesRestored?: boolean };

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
    bedrooms: document.bedrooms ?? countFromRoomSetup(document.rooms, /(\d+)\s*bed/i),
    bathrooms: document.bathrooms ?? countFromRoomSetup(document.rooms, /(\d+)\s*(?:bath|toilet|t&b|cr\b)/i),
    rooms: document.rooms,
    rate: document.rate,
    images: document.images,
    notes: document.notes,
    status: document.status,
    customItems: document.customItems,
    ...(document.designedBy ? { designedBy: document.designedBy.toHexString() } : {}),
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
