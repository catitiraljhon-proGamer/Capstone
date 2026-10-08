import type { AddressDetails } from "@/types/clients";

export type PhPlace = { code: string; name: string };
export type PhCity = PhPlace & { barangays: PhPlace[] };

/** Barangay codes start with their city's prefix; Manila's run through its districts. */
export function cityCodePrefix(cityCode: string) {
  return cityCode.endsWith("00000") ? cityCode.slice(0, 5) : cityCode.slice(0, 7);
}

/** "123 Rizal St., Brgy. Baclaran, Balayan, Batangas 4213" */
export function formatAddress(
  address: Pick<AddressDetails, "street" | "barangay" | "city" | "province" | "postalCode">,
) {
  const barangay = /^(barangay|brgy\.?)\s/i.test(address.barangay)
    ? address.barangay
    : `Brgy. ${address.barangay}`;
  return `${address.street}, ${barangay}, ${address.city}, ${address.province} ${address.postalCode}`;
}

const provinceCache = new Map<string, Promise<PhCity[]>>();
let provincesPromise: Promise<PhPlace[]> | undefined;

async function readJson<T>(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load the address list. Refresh the page and try again.");
  return (await response.json()) as T;
}

/** Province list, sorted A to Z, served from public/ph-address. */
export function loadProvinces() {
  provincesPromise ??= readJson<PhPlace[]>("/ph-address/provinces.json").catch((error: unknown) => {
    provincesPromise = undefined;
    throw error;
  });
  return provincesPromise;
}

/** Cities and barangays of one province, sorted A to Z, loaded on demand. */
export function loadProvinceCities(provinceCode: string) {
  let cities = provinceCache.get(provinceCode);
  if (!cities) {
    cities = readJson<{ cities: PhCity[] }>(`/ph-address/${provinceCode}.json`)
      .then((payload) => payload.cities)
      .catch((error: unknown) => {
        provinceCache.delete(provinceCode);
        throw error;
      });
    provinceCache.set(provinceCode, cities);
  }
  return cities;
}
