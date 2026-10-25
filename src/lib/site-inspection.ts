import type { SiteInspectionDocument } from "@/lib/database/collections";
import type { SiteInspectionDto } from "@/types/design-requests";

/**
 * The in-person check of a customer's lot. An architect or engineer visits the site to see its size, shape, and which
 * side faces the road (for sunlight and airflow) before the design request can be approved.
 */
export const lotFacings = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"] as const;
export type LotFacing = (typeof lotFacings)[number];

export const siteInspectionResults = ["Approved", "Not suitable"] as const;
export type SiteInspectionStatus = "Scheduled" | (typeof siteInspectionResults)[number];

/** Photos the admin may attach from the visit. */
export const maxSitePhotos = 6;

/** Photos are left out; the admin's review loads them with the approval. */
export function toSiteInspectionDto(inspection: SiteInspectionDocument): SiteInspectionDto {
  return {
    status: inspection.status,
    scheduledFor: inspection.scheduledFor.toISOString(),
    durationMinutes: inspection.durationMinutes,
    ...(inspection.lotArea !== undefined ? { lotArea: inspection.lotArea } : {}),
    ...(inspection.frontage !== undefined ? { frontage: inspection.frontage } : {}),
    ...(inspection.depth !== undefined ? { depth: inspection.depth } : {}),
    ...(inspection.facing ? { facing: inspection.facing } : {}),
    ...(inspection.notes ? { notes: inspection.notes } : {}),
    ...(inspection.reason ? { reason: inspection.reason } : {}),
    photoCount: inspection.photos?.length ?? 0,
    ...(inspection.recordedAt ? { recordedAt: inspection.recordedAt.toISOString() } : {}),
    ...(inspection.recordedByName ? { recordedByName: inspection.recordedByName } : {}),
  };
}
