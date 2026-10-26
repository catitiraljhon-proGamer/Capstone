/**
 * The 1-year warranty on a completed house. It starts on the day the Admin marks the project Completed and lasts the
 * Warranty length set in Maintenance (12 months by default). Customers report problems while it runs; the Admin
 * inspects each one at the house, decides whether it is covered, and repairs covered problems for free.
 */
export const warrantyClaimStatuses = [
  "Submitted",
  "Inspection scheduled",
  "Covered",
  "Not covered",
  "Repair scheduled",
  "Repaired",
  "Closed",
] as const;
export type WarrantyClaimStatus = (typeof warrantyClaimStatuses)[number];

export const warrantyStatusClass: Record<WarrantyClaimStatus, string> = {
  Submitted: "bg-red-50 text-red-800",
  "Inspection scheduled": "bg-amber-50 text-amber-800",
  Covered: "bg-emerald-50 text-emerald-700",
  "Not covered": "bg-stone-100 text-stone-700",
  "Repair scheduled": "bg-amber-50 text-amber-800",
  Repaired: "bg-rose-50 text-red-800",
  Closed: "bg-emerald-50 text-emerald-700",
};

/** Claims the Admin still has to act on or the customer still has to confirm. */
export const openWarrantyClaimStatuses: readonly WarrantyClaimStatus[] = ["Submitted", "Inspection scheduled", "Covered", "Repair scheduled", "Repaired"];

/** The steps a claim moves through, as the customer and the Admin see them. */
export const warrantyClaimSteps = ["Submitted", "Inspection", "Covered or not", "Repair", "Closed"] as const;

/** Index into warrantyClaimSteps of the step a claim is on; a finished claim is past the last step. */
export function warrantyClaimStep(status: WarrantyClaimStatus) {
  switch (status) {
    case "Submitted": return 0;
    case "Inspection scheduled": return 1;
    case "Covered": return 3;
    case "Repair scheduled": return 3;
    case "Repaired": return 4;
    case "Not covered":
    case "Closed": return warrantyClaimSteps.length;
  }
}

export const maxClaimPhotos = 4;
export const maxInspectionPhotos = 6;

export const warrantyLimits = {
  problemTypes: 20,
  problemTypeName: 60,
  notCoveredReasons: 10,
  notCoveredReason: 160,
  location: 120,
  description: 1_000,
  inspectedBy: 80,
  findings: 1_000,
  repairNotes: 1_000,
} as const;

export type WarrantyProblemType = {
  name: string;
  /** Hidden types are no longer offered in Report a Problem; old claims keep their name. */
  shown: boolean;
};

/** The lists the Admin edits in Maintenance > Warranty. */
export type WarrantyLists = {
  problemTypes: WarrantyProblemType[];
  notCoveredReasons: string[];
};

/** Used until the Admin saves their own lists. */
export const defaultWarrantyLists: WarrantyLists = {
  problemTypes: [
    "Roof leak",
    "Wall or ceiling crack",
    "Plumbing",
    "Electrical",
    "Doors and windows",
    "Floor tiles",
    "Foundation, columns or beams",
    "Other",
  ].map((name) => ({ name, shown: true })),
  notCoveredReasons: [
    "Damage from misuse or lack of upkeep",
    "Changes or repairs made by the owner or other contractors",
    "Normal wear, such as fading paint",
    "Typhoons, floods, earthquakes and fire",
  ],
};

/** Admin view: the current lists and who last saved them (none while the built-in lists are used). */
export type WarrantyListsView = WarrantyLists & {
  changedBy: string | null;
  changedAt: string | null;
};

const dayMs = 86_400_000;

/** The same calendar day `months` later (YYYY-MM-DD); the 31st becomes the last day of a shorter month. */
export function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Whole days from one YYYY-MM-DD date to another; negative when `to` has passed. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / dayMs);
}

/** "Aug 14, 2027" for a YYYY-MM-DD Manila date. */
export function warrantyDate(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });
}

/** "1-year" or "18-month", as in "your 1-year warranty". */
export function warrantyTerm(months: number) {
  return months % 12 === 0 ? `${months / 12}-year` : `${months}-month`;
}

/** "12 months" reads better as "1 year" on the customer's screens and the certificate. */
export function warrantyLengthLabel(months: number) {
  if (months % 12 === 0) return months === 12 ? "1 year" : `${months / 12} years`;
  return months === 1 ? "1 month" : `${months} months`;
}
