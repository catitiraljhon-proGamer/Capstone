import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  formatPeso,
  formatRoomSetup,
  getDesignEstimate,
} from "@/lib/house-design-data";
import { houseDesignInputSchema, houseDesignPatchSchema, toHouseDesignDto } from "@/lib/server/house-designs";
import type { HouseDesignDocument } from "@/lib/database/collections";

const fence = { id: "fence", item: "Fence", material: "Steel", unit: "lm", quantity: 2.5, unitPrice: 10.25 };
const designInput = {
  name: "Test House", houseType: "Bungalow", area: 100,
  bedrooms: 3, bathrooms: 2, rate: 20000, images: ["/test-house.jpg"], notes: "",
  status: "Published", customItems: [],
};

test("a design's estimate is the floor area times the cost rate", () => {
  assert.deepEqual(getDesignEstimate({ area: 100, rate: 20000 }), { baseEstimate: 2_000_000, customTotal: 0, estimate: 2_000_000 });
  assert.equal(getDesignEstimate({ area: 120.5, rate: 35000.5 }).estimate, 4_217_560.25);
});

test("custom exterior items are added to the estimate", () => {
  const estimate = getDesignEstimate({ area: 100, rate: 20000, customItems: [fence, { ...fence, id: "canopy", quantity: 1, unitPrice: 85000 }] });
  assert.equal(estimate.customTotal, 85025.63);
  assert.equal(estimate.estimate, 2_085_025.63);
});

test("default exterior material fields from an outdated page are ignored", () => {
  const parsed = houseDesignInputSchema.parse({ ...designInput, defaultSelections: [0, 1], materialPrices: [] });
  assert.equal("defaultSelections" in parsed, false);
  assert.equal("materialPrices" in parsed, false);
  assert.deepEqual(houseDesignPatchSchema.parse({ status: "Draft" }), { status: "Draft" });
});

test("legacy records with saved materials and a text room setup stay compatible", () => {
  const legacy = {
    ...houseDesignInputSchema.parse(designInput), bedrooms: undefined, bathrooms: undefined,
    rooms: "4 bedrooms, 3 toilets", defaultSelections: [2, 1], materialPrices: [], _id: new ObjectId(),
    createdBy: new ObjectId(), createdByName: "Test Admin", createdAt: new Date(), updatedAt: new Date(),
  } as HouseDesignDocument;
  const dto = toHouseDesignDto(legacy);
  assert.equal(dto.bedrooms, 4);
  assert.equal(dto.bathrooms, 3);
  assert.equal("defaultSelections" in dto, false);
  assert.equal(getDesignEstimate(dto).estimate, 2_000_000);
});

test("room counts are whole numbers saved together", () => {
  assert.equal(houseDesignInputSchema.safeParse({ ...designInput, bedrooms: 2.5 }).success, false);
  assert.equal(houseDesignInputSchema.safeParse({ ...designInput, bathrooms: 101 }).success, false);
  assert.equal(houseDesignPatchSchema.safeParse({ bedrooms: 4 }).success, false);
  assert.deepEqual(houseDesignPatchSchema.parse({ bedrooms: 4, bathrooms: 3 }), { bedrooms: 4, bathrooms: 3 });
  assert.equal(formatRoomSetup(1, 1), "1 bedroom, 1 bathroom");
  assert.equal(formatRoomSetup(3, 2), "3 bedrooms, 2 bathrooms");
});

test("peso amounts display centavos without rounding them to whole pesos", () => {
  assert.equal(formatPeso(1675.25), "₱1,675.25");
  assert.equal(formatPeso(1450), "₱1,450");
  assert.equal(formatPeso(783_565.2), "₱783,565.20");
});
