import type { RoomSizes } from "@/lib/system-settings";

/**
 * Room sizes come from Maintenance > Room sizes (typical sizes by default: 9 sqm bedroom, 3 sqm toilet and bath,
 * 6 sqm kitchen, 12 sqm living and dining). Every house gets one kitchen and one living area, and walls and
 * hallways add a share on top. The result is a guide only: requests are never blocked, and the Admin decides
 * during the feasibility review.
 */

/** The smallest floor area, in whole sqm, that usually fits this many bedrooms and bathrooms. */
export function minimumFloorArea(bedrooms: number, bathrooms: number, sizes: RoomSizes) {
  const rooms =
    bedrooms * sizes.roomBedroomSqm +
    bathrooms * sizes.roomBathroomSqm +
    sizes.roomKitchenSqm +
    sizes.roomLivingSqm;
  // Rounded to two decimals first so 25 × 1.2 stays 30, not 30.000000000000004.
  return Math.ceil(Math.round(rooms * (1 + sizes.roomWallsPercent / 100) * 100) / 100);
}

/** The minimum floor area when the given one looks too small for the rooms; null when it fits or a number is unusable. */
export function roomSpaceShortfall(floorArea: number, bedrooms: number, bathrooms: number, sizes: RoomSizes) {
  if (![floorArea, bedrooms, bathrooms].every((value) => Number.isFinite(value) && value >= 0) || floorArea <= 0) return null;
  const needed = minimumFloorArea(bedrooms, bathrooms, sizes);
  return floorArea < needed ? needed : null;
}

/** "3 bedrooms and 2 bathrooms", for the warning sentences. */
export const roomsPhrase = (bedrooms: number, bathrooms: number) =>
  `${bedrooms} bedroom${bedrooms === 1 ? "" : "s"} and ${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`;
