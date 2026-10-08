// Builds the Philippine address lists used by the address dropdowns from the
// PSA Philippine Standard Geographic Code (PSGC), via the psgc.cloud API.
//
//   node scripts/build-ph-address.mjs            # download and rebuild
//   PSGC_CACHE=dir node scripts/build-ph-address.mjs   # reuse a downloaded copy
//
// ZIP codes from this source are unreliable (e.g. Balayan is listed as 4207,
// not 4213), so postal codes are typed by the user instead.
//
// Outputs:
//   public/ph-address/provinces.json       sorted province list (browser)
//   public/ph-address/<provinceCode>.json  cities and barangays of one province (browser)
//   src/lib/ph-address-index.json          province and city index (server validation)
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const api = "https://psgc.cloud/api";
const cacheDir = process.env.PSGC_CACHE;
const publicDir = join("public", "ph-address");
const indexFile = join("src", "lib", "ph-address-index.json");

async function load(name, url) {
  const cached = cacheDir && join(cacheDir, name);
  if (cached && existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8"));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

// The source double-encodes some UTF-8 text ("NiÃ±o"); decode it back ("Niño").
function cleanName(value) {
  const text = /[ÃÂ]/.test(value) ? Buffer.from(value, "latin1").toString("utf8") : value;
  return text.replace(/\s+/g, " ").trim();
}

// "City of Batangas" -> "Batangas City", so cities sort by their own name.
function cityName(value) {
  const name = cleanName(value);
  if (name === "City of Manila") return "Manila";
  const match = /^City of (.+)$/.exec(name);
  return match ? `${match[1]} City` : name;
}

const byName = (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

// Metro Manila and the Special Geographic Area have no province in the PSGC.
const metroManila = { code: "1300000000", name: "Metro Manila" };
const specialArea = { code: "1999900000", name: "Special Geographic Area (BARMM)" };

// Highly urbanized cities are independent of a province in the PSGC; list them
// under the province people expect to find them in.
const independentCityProvince = {
  "0330100000": "Pampanga", // Angeles
  "0331400000": "Zambales", // Olongapo
  "0431200000": "Quezon", // Lucena
  "1731500000": "Palawan", // Puerto Princesa
  "0631000000": "Iloilo", // Iloilo City
  "0630200000": "Negros Occidental", // Bacolod
  "0730600000": "Cebu", // Cebu City
  "0731100000": "Cebu", // Lapu-Lapu
  "0731300000": "Cebu", // Mandaue
  "0831600000": "Leyte", // Tacloban
  "0931700000": "Zamboanga del Sur", // Zamboanga City
  "0990101000": "Basilan", // Isabela City
  "1030900000": "Lanao del Norte", // Iligan
  "1030500000": "Misamis Oriental", // Cagayan de Oro
  "1130700000": "Davao del Sur", // Davao City
  "1230800000": "South Cotabato", // General Santos
  "1430300000": "Benguet", // Baguio
  "1630400000": "Agusan del Norte", // Butuan
};

/** Barangays belong to a city by code prefix; Manila's run through its districts. */
const cityPrefix = (code) => (code.endsWith("00000") ? code.slice(0, 5) : code.slice(0, 7));

const regions = await load("regions.json", `${api}/regions`);
const provinceRecords = await load("provinces.json", `${api}/provinces`);
const provinces = new Map(
  provinceRecords.map((province) => [province.code, { code: province.code, name: cleanName(province.name) }]),
);
provinces.set(metroManila.code, metroManila);
provinces.set(specialArea.code, specialArea);
const provinceCodeByName = new Map([...provinces.values()].map((province) => [province.name, province.code]));

const cities = [];
const barangays = [];
for (const region of regions) {
  cities.push(...(await load(join("cm", `${region.code}.json`), `${api}/regions/${region.code}/cities-municipalities`)));
  barangays.push(...(await load(join("brgy", `${region.code}.json`), `${api}/regions/${region.code}/barangays`)));
}

function provinceOf(city) {
  if (city.code.startsWith("13")) return metroManila.code;
  if (city.type === "SGU") return specialArea.code;
  const mapped = independentCityProvince[city.code];
  if (mapped) {
    const code = provinceCodeByName.get(mapped);
    if (!code) throw new Error(`Unknown province ${mapped} for ${city.name}`);
    return code;
  }
  const code = `${city.code.slice(0, 5)}00000`;
  if (!provinces.has(code)) throw new Error(`No province for ${city.code} ${city.name}`);
  return code;
}

const cityList = cities
  .filter((city) => city.type !== "SubMun")
  .map((city) => ({
    code: city.code,
    name: cityName(city.name),
    provinceCode: provinceOf(city),
    barangays: [],
  }));

const cityByPrefix = new Map(cityList.map((city) => [cityPrefix(city.code), city]));
for (const barangay of barangays) {
  const city = cityByPrefix.get(barangay.code.slice(0, 7)) ?? cityByPrefix.get(barangay.code.slice(0, 5));
  if (!city) throw new Error(`No city for barangay ${barangay.code} ${barangay.name}`);
  city.barangays.push({ code: barangay.code, name: cleanName(barangay.name) });
}

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });

const usedProvinces = [...provinces.values()]
  .filter((province) => cityList.some((city) => city.provinceCode === province.code))
  .sort(byName);
writeFileSync(join(publicDir, "provinces.json"), JSON.stringify(usedProvinces));

for (const province of usedProvinces) {
  const provinceCities = cityList
    .filter((city) => city.provinceCode === province.code)
    .sort(byName)
    .map(({ code, name, barangays: list }) => ({
      code,
      name,
      barangays: [...list].sort(byName),
    }));
  writeFileSync(join(publicDir, `${province.code}.json`), JSON.stringify({ cities: provinceCities }));
}

writeFileSync(
  indexFile,
  `${JSON.stringify({
    source: "PSA PSGC via psgc.cloud",
    provinces: Object.fromEntries(usedProvinces.map((province) => [province.code, province.name])),
    cities: Object.fromEntries(
      cityList.map((city) => [city.code, { name: city.name, provinceCode: city.provinceCode }]),
    ),
  })}\n`,
);

console.log(
  `Wrote ${usedProvinces.length} provinces, ${cityList.length} cities/municipalities, ${barangays.length} barangays.`,
);
