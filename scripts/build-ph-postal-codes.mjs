// Adds PHLPost postal codes to the Luzon address lists built by build-ph-address.mjs, so the
// Postal Code field fills itself in. Run it again after rebuilding the address lists.
//
//   node scripts/build-ph-postal-codes.mjs                   # download the list and update
//   PHZIP_CACHE=file node scripts/build-ph-postal-codes.mjs  # reuse a downloaded copy
//   node scripts/build-ph-postal-codes.mjs --review          # also print every Metro Manila match
//
// Outside Metro Manila each city or municipality has one code, saved as `postalCode` on the city.
// Metro Manila codes follow the area, so they are saved on each barangay that has a known one.
// Barangays without one (numbered barangays in Caloocan and Pasay, multi-code Manila districts,
// names that match no area) keep a typed postal code.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const listUrl = "https://raw.githubusercontent.com/jayson-panganiban/phzipcodes/main/phzipcodes/data/ph_zip_codes.json";
const publicDir = join("public", "ph-address");
const metroManilaCode = "1300000000";
const review = process.argv.includes("--review");

const cache = process.env.PHZIP_CACHE;
const list = cache && existsSync(cache)
  ? JSON.parse(readFileSync(cache, "utf8"))
  : await (await fetch(listUrl)).json();
const supplement = JSON.parse(readFileSync(join("scripts", "ph-postal-codes-supplement.json"), "utf8"));

const numberWords = { uno: "1", dos: "2", tres: "3", kuatro: "4", singko: "5", i: "1", ii: "2" };

/** Lowercase ASCII words, with Sto./Sta./Gen. spelled out and "City" dropped, for name matching. */
function normalize(value) {
  return value
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bsto\.?\s/g, "santo ").replace(/\bsta\.?\s/g, "santa ").replace(/\bgen\.?\s/g, "general ")
    .replace(/\bcity of\b|\bcity\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ").filter(Boolean).map((word) => numberWords[word] ?? word).join(" ");
}

const isCode = (value) => /^\d{4}$/.test(value);

// Province name -> normalized area name -> postal codes.
const listByProvince = new Map();
for (const provinces of Object.values(list)) {
  for (const [province, areas] of Object.entries(provinces)) {
    const areaMap = listByProvince.get(normalize(province.replace(/\(.*?\)/g, " "))) ?? new Map();
    for (const [area, codes] of Object.entries(areas)) {
      const valid = [...new Set(codes.filter(isCode))];
      if (valid.length) areaMap.set(normalize(area.replace(/\(.*?\)/g, " ")), valid);
    }
    // "Camarines Sur (Camsur)" -> "camarines sur"
    listByProvince.set(normalize(province.replace(/\(.*?\)/g, " ")), areaMap);
  }
}

/**
 * Metro Manila area names in one city's code range, split into the barangay names they cover:
 * "Arkong Bato-Rincon-Pasolo" -> three names, "Rembo (West)" -> "west rembo" and "rembo west".
 * A name pointing at two different codes is dropped as ambiguous.
 */
function metroAreas(range) {
  const names = new Map();
  const add = (name, code) => {
    const key = normalize(name).replace(/\b(village|vill|subdivision|subd|po|cpo|proper)\b/g, " ").replace(/\s+/g, " ").trim();
    if (!key) return;
    const current = names.get(key);
    names.set(key, current === undefined || current === code ? code : null);
  };
  const metro = list["NCR (National Capital Region)"]["Metro Manila"];
  for (const [area, codes] of Object.entries(metro)) {
    const inRange = [...new Set(codes.filter((code) => isCode(code) && +code >= range[0] && +code <= range[1]))];
    if (inRange.length !== 1) continue;
    const code = inRange[0];
    const direction = /\((north|south|east|west)\)/i.exec(area)?.[1] ?? "";
    const bare = area.replace(/\(.*?\)/g, " ").trim();
    // The whole name ("Bel-air") and each name it lists ("Pinagkaisahan-pitogo" -> both barangays).
    for (const part of new Set([bare, ...bare.split(/-|\/|&|,|\s+and\s+/i)])) {
      add(part, code);
      if (direction) {
        add(`${direction} ${part}`, code);
        add(`${part} ${direction}`, code);
      }
    }
  }
  return names;
}

/** A barangay's code from its city's areas: exact name, else the name without a trailing number or direction. */
function metroCode(barangayName, areas) {
  const name = normalize(barangayName);
  const tries = [name, name.replace(/\s(\d+|north|south|east|west)$/, ""), name.replace(/^(north|south|east|west)\s/, "")];
  for (const key of tries) {
    const code = areas.get(key);
    if (code) return code;
  }
  return undefined;
}

const provinces = JSON.parse(readFileSync(join(publicDir, "provinces.json"), "utf8"));
const stats = { cities: 0, cityCodes: 0, barangays: 0, barangayCodes: 0 };
const missingCities = [];

for (const province of provinces) {
  const file = join(publicDir, `${province.code}.json`);
  const payload = JSON.parse(readFileSync(file, "utf8"));
  const areas = listByProvince.get(normalize(province.name)) ?? new Map();

  for (const city of payload.cities) {
    delete city.postalCode;
    for (const barangay of city.barangays) delete barangay.postalCode;

    const listed = supplement.cities[`${province.name} › ${city.name}`];
    if (province.code !== metroManilaCode) {
      stats.cities += 1;
      const code = listed ?? areas.get(normalize(city.name))?.[0];
      if (code) {
        city.postalCode = code;
        stats.cityCodes += 1;
      } else {
        missingCities.push(`${province.name} › ${city.name}`);
      }
      continue;
    }

    // Metro Manila: a whole-city code (Pateros), Manila by district, or other cities by barangay name.
    stats.barangays += city.barangays.length;
    if (listed) {
      city.postalCode = listed;
      stats.barangayCodes += city.barangays.length;
      continue;
    }
    const range = supplement.metroManilaRanges[city.name];
    const cityAreas = range ? metroAreas(range) : null;
    for (const barangay of city.barangays) {
      const code = city.name === "Manila"
        ? supplement.manilaDistricts[barangay.code.slice(0, 7)]
        : cityAreas && metroCode(barangay.name, cityAreas);
      if (code) {
        barangay.postalCode = code;
        stats.barangayCodes += 1;
      }
      if (review && city.name !== "Manila") console.log(`${city.name} › ${barangay.name}: ${code ?? "typed"}`);
    }
  }

  writeFileSync(file, JSON.stringify(payload));
}

console.log(`Cities and municipalities outside Metro Manila with a code: ${stats.cityCodes}/${stats.cities}`);
console.log(`Metro Manila barangays with a code: ${stats.barangayCodes}/${stats.barangays}`);
if (missingCities.length) console.log(`No code found (typed instead): ${missingCities.join(", ")}`);
