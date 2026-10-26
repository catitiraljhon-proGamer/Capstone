import type { WarrantyClaimStatus } from "@/lib/warranty";

/**
 * Warranty claims: the customer reports a problem with their completed house while its warranty runs, the Admin
 * inspects it at the house, records whether it is covered, schedules and finishes the repair, and the customer
 * confirms it is fixed (or the claim closes by itself after the days set in Maintenance).
 *
 * API contract (all JSON, errors are `{ error: string }`):
 * - GET   /api/warranty-claims                customer: own · admin: all → WarrantyClaimsResponse
 * - POST  /api/warranty-claims                customer: WarrantyClaimInput → { claim: WarrantyClaimDto }
 * - GET   /api/warranty-claims/[id]           customer: own · admin: any → { claim: WarrantyClaimDto } with photos
 * - PATCH /api/warranty-claims/[id]           WarrantyClaimAction → { claim: WarrantyClaimDto } with photos
 * - GET   /api/construction/projects/[id]/warranty-certificate   customer: own · admin: any → WarrantyCertificateDto
 * - GET   /api/maintenance/warranty           admin → WarrantyListsView
 * - PUT   /api/maintenance/warranty           admin: WarrantyLists → WarrantyListsView
 */

/** The warranty of a completed project. Dates are YYYY-MM-DD in Manila time; `endsOn` is the last covered day. */
export type ProjectWarrantyDto = {
  months: number;
  startsOn: string;
  endsOn: string;
  active: boolean;
  /** 0 on the last covered day; negative once it has ended. */
  daysLeft: number;
};

export type WarrantyVisitDto = {
  scheduledFor: string;
  durationMinutes: number;
  location: string;
};

export type WarrantyClaimDto = {
  id: string;
  reference: string;
  status: WarrantyClaimStatus;
  project: { id: string; reference: string; name: string };
  customer: { id: string; name: string };
  problemType: string;
  location: string;
  description: string;
  noticedOn: string;
  reportedAt: string;
  warrantyEndsOn: string;
  photoCount: number;
  /** Only on a single claim (GET or PATCH of /api/warranty-claims/[id]); lists leave the photos out. */
  photos?: string[];
  inspection: WarrantyVisitDto | null;
  result: {
    inspectedOn: string;
    inspectedBy: string;
    findings: string;
    covered: boolean;
    reason: string | null;
    photoCount: number;
    photos?: string[];
    recordedAt: string;
    recordedByName: string;
  } | null;
  repair: (WarrantyVisitDto & { repairedAt: string | null; notes: string | null; repairedByName: string | null }) | null;
  /** While Repaired: the day the claim closes by itself if the customer does not confirm first. */
  closesOn: string | null;
  closedAt: string | null;
  closedBy: "customer" | "automatic" | null;
  updatedAt: string;
};

export type WarrantyClaimsResponse = {
  claims: WarrantyClaimDto[];
  /** The problem types the Admin shows in Report a Problem, in order. */
  problemTypes: string[];
  /** Warranty length and auto-close days from Maintenance. */
  warrantyMonths: number;
  closeDays: number;
};

export type WarrantyClaimInput = {
  projectId: string;
  problemType: string;
  noticedOn: string;
  location: string;
  description: string;
  photos: string[];
};

export type WarrantyClaimAction =
  | { action: "schedule-inspection"; scheduledFor: string; durationMinutes: number }
  | { action: "record-inspection"; inspectedOn: string; inspectedBy: string; findings: string; covered: true; photos: string[] }
  | { action: "record-inspection"; inspectedOn: string; inspectedBy: string; findings: string; covered: false; reason: string; photos: string[] }
  | { action: "schedule-repair"; scheduledFor: string; durationMinutes: number }
  | { action: "mark-repaired"; notes: string }
  | { action: "confirm-repair" };

export type WarrantyCertificateDto = {
  number: string;
  customerName: string;
  project: { reference: string; name: string };
  siteAddress: string | null;
  months: number;
  startsOn: string;
  endsOn: string;
  /** The problem types the Admin shows in Report a Problem. */
  covers: string[];
  notCovered: string[];
};
