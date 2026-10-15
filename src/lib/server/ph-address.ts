import phAddressIndex from "@/lib/ph-address-index.json";
import { cityCodePrefix, formatAddress } from "@/lib/ph-address";
import type { AddressDetails } from "@/types/clients";
import { z } from "zod";

const index = phAddressIndex as {
  provinces: Record<string, string>;
  cities: Record<string, { name: string; provinceCode: string }>;
};

const psgcCode = z.string().regex(/^\d{10}$/, "Choose your address from the lists.");

/**
 * Validates an address picked from the dropdowns. Province and city names come
 * from the PSGC index, so only the barangay name is taken from the request.
 */
export const addressDetailsSchema = z
  .object({
    provinceCode: psgcCode,
    cityCode: psgcCode,
    barangayCode: psgcCode,
    barangay: z.string().trim().min(1, "Choose your barangay.").max(120),
    street: z.string().trim().max(200).refine((street) => street.length !== 1, "House no. / street must be at least 2 characters."),
    postalCode: z.string().trim().regex(/^\d{4}$/, "Enter a 4-digit postal code."),
  })
  .strict()
  .transform((input, ctx): AddressDetails => {
    const province = index.provinces[input.provinceCode];
    // The index lists Luzon provinces only (see scripts/build-ph-address.mjs).
    if (!province) {
      ctx.addIssue({ code: "custom", message: "We currently serve addresses in Luzon only.", path: ["provinceCode"] });
      return z.NEVER;
    }
    const city = index.cities[input.cityCode];
    if (!city || city.provinceCode !== input.provinceCode) {
      ctx.addIssue({ code: "custom", message: "Choose a city or municipality in the selected province.", path: ["cityCode"] });
      return z.NEVER;
    }
    if (!input.barangayCode.startsWith(cityCodePrefix(input.cityCode))) {
      ctx.addIssue({ code: "custom", message: "Choose a barangay in the selected city or municipality.", path: ["barangayCode"] });
      return z.NEVER;
    }
    return { ...input, province, city: city.name };
  });

export { formatAddress };
