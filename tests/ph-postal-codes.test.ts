import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addressFieldErrors } from "@/components/clients/ph-address-fields";
import type { PhCity, PhPlace } from "@/lib/ph-address";

const publicDir = join(process.cwd(), "public", "ph-address");
const metroManilaCode = "1300000000";
const provinces = JSON.parse(readFileSync(join(publicDir, "provinces.json"), "utf8")) as PhPlace[];
const citiesOf = (provinceCode: string) =>
  (JSON.parse(readFileSync(join(publicDir, `${provinceCode}.json`), "utf8")) as { cities: PhCity[] }).cities;
const provinceCode = (name: string) => provinces.find((province) => province.name === name)!.code;
const city = (province: string, name: string) => citiesOf(provinceCode(province)).find((item) => item.name === name)!;

test("every city and municipality outside Metro Manila has a 4-digit postal code", () => {
  for (const province of provinces.filter((item) => item.code !== metroManilaCode)) {
    for (const item of citiesOf(province.code)) {
      assert.match(item.postalCode ?? "", /^\d{4}$/, `${province.name} › ${item.name}`);
    }
  }
});

test("postal codes match PHLPost for known places", () => {
  assert.equal(city("Batangas", "Balayan").postalCode, "4213");
  assert.equal(city("Pangasinan", "Dagupan City").postalCode, "2400");
  assert.equal(city("Bataan", "Orani").postalCode, "2112");
  assert.equal(city("Benguet", "Baguio City").postalCode, "2600");
  assert.equal(city("Metro Manila", "Pateros").postalCode, "1620");
  assert.equal(city("Metro Manila", "Makati City").barangays.find((item) => item.name === "Bel-Air")?.postalCode, "1209");
  assert.equal(city("Metro Manila", "Quezon City").barangays.find((item) => item.name === "Commonwealth")?.postalCode, "1121");
  // Manila barangays take their district's code; Binondo's barangays start with 1380602.
  assert.equal(city("Metro Manila", "Manila").barangays.find((item) => item.code.startsWith("1380602"))?.postalCode, "1006");
});

test("the postal code is only checked once a barangay is chosen", () => {
  const address = { addressProvinceCode: "0401000000", addressCityCode: "0401003000" };
  assert.equal(addressFieldErrors(address).addressPostalCode, undefined);
  assert.equal(addressFieldErrors({ ...address, addressBarangayCode: "0401003001" }).addressPostalCode, "Enter the 4-digit postal code.");
  assert.equal(addressFieldErrors({ ...address, addressBarangayCode: "0401003001", addressPostalCode: "4213" }).addressPostalCode, undefined);
});
