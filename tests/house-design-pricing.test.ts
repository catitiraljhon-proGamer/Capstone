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
import { minimumFloorArea, roomSpaceShortfall, roomsPhrase } from "@/lib/room-space";
import { defaultRoomSizes } from "@/lib/system-settings";

const fence = { id: "fence", item: "Fence", material: "Steel", unit: "lm", quantity: 2.5, unitPrice: 10.25 };
const designInput = {
  name: "Test House", houseType: "Bungalow", area: 100,
  bedrooms: 3, bathrooms: 2, finish: "Standard", rate: 20000, images: ["/test-house.jpg"], notes: "",
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

test("a design has one of the three finish levels, and older designs without one still load", () => {
  assert.equal(houseDesignInputSchema.parse(designInput).finish, "Standard");
  assert.equal(houseDesignInputSchema.safeParse({ ...designInput, finish: undefined }).success, false);
  assert.equal(houseDesignInputSchema.safeParse({ ...designInput, finish: "Ultra" }).success, false);
  assert.deepEqual(houseDesignPatchSchema.parse({ finish: "Luxury" }), { finish: "Luxury" });

  const saved = {
    ...houseDesignInputSchema.parse(designInput), rooms: "3 bedrooms, 2 bathrooms", _id: new ObjectId(),
    createdBy: new ObjectId(), createdByName: "Test Admin", createdAt: new Date(), updatedAt: new Date(),
  } as HouseDesignDocument;
  assert.equal(toHouseDesignDto(saved).finish, "Standard");
  assert.equal("finish" in toHouseDesignDto({ ...saved, finish: undefined }), false);
});

test("room counts are whole numbers saved together", () => {
  assert.equal(houseDesignInputSchema.safeParse({ ...designInput, bedrooms: 2.5 }).success, false);
  assert.equal(houseDesignInputSchema.safeParse({ ...designInput, bathrooms: 101 }).success, false);
  assert.equal(houseDesignPatchSchema.safeParse({ bedrooms: 4 }).success, false);
  assert.deepEqual(houseDesignPatchSchema.parse({ bedrooms: 4, bathrooms: 3 }), { bedrooms: 4, bathrooms: 3 });
  assert.equal(formatRoomSetup(1, 1), "1 bedroom, 1 bathroom");
  assert.equal(formatRoomSetup(3, 2), "3 bedrooms, 2 bathrooms");
});

test("the room-space guide only warns when the floor area is too small for the rooms", () => {
  const sizes = defaultRoomSizes;
  // (bedrooms × 9 + bathrooms × 3 + kitchen 6 + living and dining 12) × 1.2, rounded up to whole sqm.
  assert.equal(minimumFloorArea(2, 2, sizes), 51);
  assert.equal(minimumFloorArea(3, 2, sizes), 62);
  assert.equal(minimumFloorArea(6, 4, sizes), 101);
  assert.equal(minimumFloorArea(0, 0, sizes), 22);
  assert.equal(minimumFloorArea(11, 6, sizes), 162);

  // The case the panel tried: 10 bedrooms and 11 bathrooms do not fit in 100 sqm.
  assert.equal(roomSpaceShortfall(100, 10, 11, sizes), 170);
  // A big house with few rooms is fine; there is never a minimum number of rooms.
  assert.equal(roomSpaceShortfall(300, 2, 2, sizes), null);
  assert.equal(roomSpaceShortfall(250, 11, 6, sizes), null);
  assert.equal(roomSpaceShortfall(62, 3, 2, sizes), null);
  assert.equal(roomSpaceShortfall(61, 3, 2, sizes), 62);

  // Unusable numbers give no warning; the form's own checks handle them.
  assert.equal(roomSpaceShortfall(0, 3, 2, sizes), null);
  assert.equal(roomSpaceShortfall(Number.NaN, 3, 2, sizes), null);
  assert.equal(roomSpaceShortfall(30, -1, 2, sizes), null);

  assert.equal(roomsPhrase(1, 1), "1 bedroom and 1 bathroom");
  assert.equal(roomsPhrase(3, 2), "3 bedrooms and 2 bathrooms");
});

test("the room-space guide uses the sizes the Admin saved in Maintenance", () => {
  const smaller = { roomBedroomSqm: 6, roomBathroomSqm: 2, roomKitchenSqm: 3, roomLivingSqm: 6, roomWallsPercent: 0 };
  assert.equal(minimumFloorArea(3, 2, smaller), 31);
  assert.equal(roomSpaceShortfall(100, 10, 11, smaller), null);
  assert.equal(minimumFloorArea(3, 2, { ...smaller, roomWallsPercent: 50 }), 47);
});

test("peso amounts display centavos without rounding them to whole pesos", () => {
  assert.equal(formatPeso(1675.25), "₱1,675.25");
  assert.equal(formatPeso(1450), "₱1,450.00");
  assert.equal(formatPeso(0), "₱0.00");
  assert.equal(formatPeso(783_565.2), "₱783,565.20");
});
