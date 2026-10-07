import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  formatPeso,
  getExteriorEstimate,
  type ExteriorItemChoice,
  type MaterialPriceOverride,
} from "@/lib/house-design-data";
import { houseDesignInputSchema, houseDesignPatchSchema, toHouseDesignDto } from "@/lib/server/house-designs";
import type { HouseDesignDocument } from "@/lib/database/collections";

const materials: ExteriorItemChoice[] = [
  { item: "Roof", detail: "Roof material", quantityByArea: 0.63, options: [
    { name: "Rib-type roofing", unit: "sqm", unitPrice: 1450 },
    { name: "Metal tile roofing", unit: "sqm", unitPrice: 1850 },
  ] },
  { item: "Windows", detail: "Window package", quantity: 2, options: [
    { name: "Aluminum windows", unit: "set", unitPrice: 11500 },
  ] },
];
const roofPrice: MaterialPriceOverride = {
  item: "Roof", material: "Rib-type roofing", unit: "sqm", unitPrice: 1675.25,
};
const designInput = {
  name: "Test House", houseType: "Bungalow", finish: "Standard", area: 100,
  rooms: "3 bedrooms", rate: 20000, images: ["/test-house.jpg"], notes: "",
  status: "Published", defaultSelections: [0, 0], customItems: [],
};

test("existing designs continue to use catalog prices", () => {
  const estimate = getExteriorEstimate({ area: 100, rate: 20000 }, [0, 0], materials);
  assert.equal(estimate.exteriorRows[0].quantity, 63);
  assert.equal(estimate.exteriorRows[0].unitPrice, 1450);
  assert.equal(estimate.exteriorTotal, 114350);
  assert.equal(estimate.revisedEstimate, 2114350);
});

test("an edited price changes the breakdown and total only for that design", () => {
  const estimate = getExteriorEstimate({ area: 100, rate: 20000, materialPrices: [roofPrice] }, [0, 0], materials);
  assert.equal(estimate.exteriorRows[0].unitPrice, 1675.25);
  assert.equal(estimate.exteriorRows[0].amount, 105540.75);
  assert.equal(estimate.exteriorTotal, 128540.75);
  assert.equal(estimate.revisedEstimate, 2128540.75);
  assert.equal(getExteriorEstimate({ area: 100, rate: 20000 }, [0, 0], materials).revisedEstimate, 2114350);
  assert.equal(materials[0].options[0].unitPrice, 1450);
});

test("switching material types uses the matching saved price and retains other option prices", () => {
  const design = { area: 100, rate: 20000, materialPrices: [roofPrice,
    { ...roofPrice, material: "Metal tile roofing", unitPrice: 2100 },
  ] };
  assert.equal(getExteriorEstimate(design, [1, 0], materials).exteriorRows[0].unitPrice, 2100);
  assert.equal(getExteriorEstimate(design, [0, 0], materials).exteriorRows[0].unitPrice, 1675.25);
  assert.equal(getExteriorEstimate({ ...design, materialPrices: [roofPrice] }, [1, 0], materials).exteriorRows[0].unitPrice, 1850);
});

test("saved prices follow material identity when catalog options are reordered", () => {
  const reordered = [{ ...materials[0], options: [...materials[0].options].reverse() }, materials[1]];
  const estimate = getExteriorEstimate({ area: 100, rate: 20000, materialPrices: [roofPrice] }, [1, 0], reordered);
  assert.equal(estimate.exteriorRows[0].material, "Rib-type roofing");
  assert.equal(estimate.exteriorRows[0].unitPrice, 1675.25);
});

test("a saved price is not applied to a different unit or item", () => {
  for (const price of [{ ...roofPrice, unit: "set" }, { ...roofPrice, item: "Windows" }]) {
    const estimate = getExteriorEstimate({ area: 100, rate: 20000, materialPrices: [price] }, [0, 0], materials);
    assert.equal(estimate.exteriorRows[0].unitPrice, 1450);
  }
});

test("clearing overrides restores catalog prices and preserves custom exterior items", () => {
  const estimate = getExteriorEstimate({ area: 100, rate: 20000, materialPrices: [], customItems: [
    { id: "fence", item: "Fence", material: "Steel", unit: "lm", quantity: 2.5, unitPrice: 10.25 },
  ] }, [0, 0], materials);
  assert.equal(estimate.exteriorRows[0].unitPrice, 1450);
  assert.equal(estimate.exteriorRows[2].amount, 25.63);
  assert.equal(estimate.revisedEstimate, 2114375.63);
});

test("create and edit validation accepts peso amounts with up to two decimals", () => {
  for (const unitPrice of [0.01, 0.29, 1675.25, 100000000]) {
    const materialPrices = [{ ...roofPrice, unitPrice }];
    assert.deepEqual(houseDesignInputSchema.parse({ ...designInput, materialPrices }).materialPrices, materialPrices);
    assert.deepEqual(houseDesignPatchSchema.parse({ materialPrices }).materialPrices, materialPrices);
  }
});

test("invalid, duplicate, or incomplete price overrides are rejected", () => {
  for (const unitPrice of [-1, 0, 1.234, 100000001, NaN, Infinity, "1500", null]) {
    assert.equal(houseDesignPatchSchema.safeParse({ materialPrices: [{ ...roofPrice, unitPrice }] }).success, false);
  }
  for (const materialPrices of [[roofPrice, roofPrice], [{ ...roofPrice, item: "" }], [{ ...roofPrice, material: "" }], [{ ...roofPrice, unit: "" }]]) {
    assert.equal(houseDesignPatchSchema.safeParse({ materialPrices }).success, false);
  }
});

test("status-only edits do not clear saved prices, and explicit resets are accepted", () => {
  assert.deepEqual(houseDesignPatchSchema.parse({ status: "Draft" }), { status: "Draft" });
  assert.deepEqual(houseDesignPatchSchema.parse({ materialPrices: [] }), { materialPrices: [] });
});

test("saved design DTOs expose price overrides and legacy records stay compatible", () => {
  const legacy: HouseDesignDocument = {
    ...houseDesignInputSchema.parse(designInput), _id: new ObjectId(),
    createdBy: new ObjectId(), createdByName: "Test Admin", createdAt: new Date(), updatedAt: new Date(),
  };
  assert.deepEqual(toHouseDesignDto(legacy).materialPrices, []);
  const dto = toHouseDesignDto({ ...legacy, materialPrices: [roofPrice] });
  const restored = JSON.parse(JSON.stringify(dto));
  assert.equal(getExteriorEstimate(restored, restored.defaultSelections, materials).exteriorRows[0].unitPrice, 1675.25);
});

test("material prices display centavos without rounding them to whole pesos", () => {
  assert.equal(formatPeso(1675.25), "₱1,675.25");
  assert.equal(formatPeso(1450), "₱1,450");
});
