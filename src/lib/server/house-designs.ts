import type { HouseDesign } from "@/components/ui/house-design-data";
import type { HouseDesignDocument } from "@/lib/database/collections";
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
  houseType: z.string().trim().min(1).max(80),
  finish: z.enum(["Standard", "Semi-luxury", "Luxury"]),
  area: z.number().finite().positive().max(100_000),
  rooms: z.string().trim().min(1).max(200),
  rate: z.number().finite().nonnegative().max(100_000_000),
  images: z.array(z.string().min(1).max(2_100_000)).min(1).max(6),
  notes: z.string().trim().max(4_000),
  status: z.enum(["Draft", "Published", "Archived"]),
  defaultSelections: z.array(z.number().int().nonnegative()).max(100),
  customItems: z.array(customExteriorItemSchema).max(100),
});

export const houseDesignPatchSchema = houseDesignInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be supplied.",
  });

export function toHouseDesignDto(document: HouseDesignDocument): HouseDesign {
  return {
    id: document._id.toHexString(),
    name: document.name,
    style: document.style,
    houseType: document.houseType,
    finish: document.finish,
    area: document.area,
    rooms: document.rooms,
    rate: document.rate,
    images: document.images,
    notes: document.notes,
    status: document.status,
    defaultSelections: document.defaultSelections,
    customItems: document.customItems,
    createdAt: document.createdAt.toISOString(),
    createdBy: document.createdByName,
  };
}
