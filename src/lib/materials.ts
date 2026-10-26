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

/** An error message for a typed price, or null when it can be saved. */
export function materialPriceError(text: string) {
  const value = text.trim();
  if (!value) return "Enter the price.";
  const price = Number(value);
  if (!Number.isFinite(price)) return "Enter a valid price.";
  if (price <= 0) return "Price must be more than ₱0.";
  if (Math.abs(price * 100 - Math.round(price * 100)) > 0.0001) return "Use at most 2 decimal places.";
  if (price > maxMaterialPrice) return "Price must be ₱10,000,000 or less.";
  return null;
}
