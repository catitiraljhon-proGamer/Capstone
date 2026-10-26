import { amountError } from "@/lib/form-validation";

/** A material in Maintenance > Materials. Staff pick these for each scope of work in a cost estimate. */
export type Material = {
  id: string;
  name: string;
  /** Current price in pesos. Estimates keep the price they were saved with. */
  price: number;
  createdAt: string;
  /** Set once the Admin changes the price. */
  priceChange: { by: string; at: string; previousPrice: number } | null;
};

export const materialNameMax = 120;
export const maxMaterialPrice = 10_000_000;

/** Material names compare without case or extra spaces, so "cement" and "Cement " are the same material. */
export const materialNameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** An error message for a typed price, or null when it can be saved; the same rules as every other peso field. */
export const materialPriceError = (text: string) => amountError(text, { label: "Price", max: maxMaterialPrice });
