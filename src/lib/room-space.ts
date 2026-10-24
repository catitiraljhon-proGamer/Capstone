/**
 * Minimum room sizes from the National Building Code (PD 1096 IRR, Section 806): 6 sqm for a room people live or
 * sleep in, 3 sqm for a kitchen, and 1.2 sqm for a toilet and bath. Every house also gets one kitchen and one living
 * area, and walls and hallways add about a fifth. The result is a guide only: requests are never blocked, and the
 * Admin decides during the feasibility review.
 */
export const minimumRoomSizes = { bedroom: 6, bathroom: 1.2, kitchen: 3, living: 6 } as const;
export const wallsAndHallwaysShare = 0.2;

/** The smallest floor area, in whole sqm, that usually fits this many bedrooms and bathrooms. */
export function minimumFloorArea(bedrooms: number, bathrooms: number) {
  const rooms =
    bedrooms * minimumRoomSizes.bedroom +
    bathrooms * minimumRoomSizes.bathroom +
    minimumRoomSizes.kitchen +
    minimumRoomSizes.living;
  // Rounded to two decimals first so 25 × 1.2 stays 30, not 30.000000000000004.
  return Math.ceil(Math.round(rooms * (1 + wallsAndHallwaysShare) * 100) / 100);
}

/** The minimum floor area when the given one looks too small for the rooms; null when it fits or a number is unusable. */
export function roomSpaceShortfall(floorArea: number, bedrooms: number, bathrooms: number) {
  if (![floorArea, bedrooms, bathrooms].every((value) => Number.isFinite(value) && value >= 0) || floorArea <= 0) return null;
  const needed = minimumFloorArea(bedrooms, bathrooms);
  return floorArea < needed ? needed : null;
}

/** "3 bedrooms and 2 bathrooms", for the warning sentences. */
export const roomsPhrase = (bedrooms: number, bathrooms: number) =>
  `${bedrooms} bedroom${bedrooms === 1 ? "" : "s"} and ${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`;
