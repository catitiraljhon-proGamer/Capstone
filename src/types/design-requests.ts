
export type RequestedHouseDesign = {
  id: string;
  name: string;
  floorArea: number;
  rooms: string;
};

/**
 * Blueprint workflow: Approved (feasible, design in progress) → In customer review ⇄ Changes requested
 * → Design approved. "Completed" marks legacy requests delivered under the old design-fee flow.
 */
export type DesignRequestStatus =
  | "Pending"
  | "In review"
  | "Approved"
  | "In customer review"
  | "Changes requested"
  | "Design approved"
  | "Rejected"
  | "Completed";

/** "legacy" requests were delivered and billed as a design fee before the blueprint workflow. */
export type DesignWorkflow = "blueprint" | "legacy";

export type DesignVersionDto = {
  version: number;
  imageCount: number;
  adminNote: string;
  createdAt: string;
  response?: { decision: "approved" | "changes"; note: string; respondedAt: string };
};

export type BlueprintFileDto = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

/** Admin view of one request's design review loop and blueprint. */
export type DesignWorkflowDto = {
  id: string;
  status: DesignRequestStatus;
  workflow: DesignWorkflow;
  versions: DesignVersionDto[];
  blueprintFiles: BlueprintFileDto[];
  estimate: { id: string; reference: string; status: string } | null;
  blueprintInvoice: { id: string; number: string; amount: number; paid: number; balance: number; pending: number } | null;
  blueprintPaid: boolean;
  /** When the admin submitted the blueprint to the Billing Clerk; files are locked from then on. */
  blueprintSubmittedAt: string | null;
  /** True while no blueprint fee invoice is active, so the admin can reopen the files to fix them. */
  blueprintCanReopen: boolean;
};

export type DesignRequestDto = {
  id: string;
  workflow: DesignWorkflow;
  selectedDesign?: RequestedHouseDesign;
  floorArea: number;
  bedrooms?: number;
  bathrooms?: number;
  rooms: string;
  notes: string;
  /** YYYY-MM-DD; missing on requests made before the timespan was required. */
  preferredDate?: string;
  neededBy?: string;
  inspirationImages: string[];
  status: DesignRequestStatus;
  completedAt?: string;
  designApprovedAt?: string;
  createdAt: string;
  /** Legacy delivered images; the blueprint workflow uses versions instead. */
  imageCount: number;
  /** Design and floor plan rounds, oldest first. Images are watermarked previews. */
  versions: DesignVersionDto[];
  /** Blueprint files; downloadable only once access is "unlocked". */
  blueprintFiles: BlueprintFileDto[];
  /** Paid files: the legacy design images, or the blueprint for the blueprint workflow. */
  access: "in-progress" | "awaiting-invoice" | "payment-required" | "unlocked";
  invoice: { id: string; number: string; amount: number; paid: number; balance: number; pending: number } | null;
};
