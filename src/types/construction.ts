import type { AddressDetails } from "@/types/clients";

/**
 * Construction phase: after a design is unlocked, the customer asks to build it,
 * the admin prepares a cost estimate (BOQ + 12% VAT + payment schedule), the
 * customer accepts with a downpayment of at least 30%, and a project is created.
 *
 * API contract (all JSON, errors are `{ error: string }`):
 * - GET   /api/construction/estimates               customer: own · admin: all → { estimates: CostEstimateDto[] }
 * - POST  /api/construction/estimates               customer: ConstructionRequestInput → { estimate: CostEstimateDto }
 * - GET   /api/construction/estimates/[id]          customer: own · admin: any → { estimate: CostEstimateDto }
 * - GET   /api/construction/estimates/[id]/prefill  admin → { lineItems: EstimateLineItemInput[]; scheduleTemplate: MilestoneTemplate[] }
 * - PATCH /api/construction/estimates/[id]          EstimateAction → { estimate: CostEstimateDto; projectId?: string }
 * - GET   /api/construction/projects                customer: own · admin/billing-clerk: all → { projects: ConstructionProjectDto[] }
 * - PATCH /api/construction/projects/[id]           admin: ProjectStatusAction → { project: ConstructionProjectDto }
 */

export type EstimateStatus = "Requested" | "Draft" | "Sent" | "Revision requested" | "Accepted";

export type ProjectStatus =
  | "Awaiting downpayment"
  | "Scheduled"
  | "Active"
  | "On hold"
  | "Completed"
  /** Legacy seeded projects created before the construction workflow. */
  | "Pending";

export type EstimateLineItem = {
  id: string;
  item: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type EstimateLineItemInput = Omit<EstimateLineItem, "id" | "amount">;

/** One row of the payment schedule before amounts are applied. The first row is always the downpayment. */
export type MilestoneTemplate = {
  label: string;
  description: string;
  /** Share of the contract total, 0–100. All rows add up to 100. */
  percentage: number;
  /** YYYY-MM-DD target date for reaching this stage. */
  targetDate: string;
};

export type PaymentMilestoneStatus = "Upcoming" | "Invoiced" | "Partially paid" | "Paid";

export type PaymentMilestoneDto = {
  id: string;
  label: string;
  description: string;
  percentage: number;
  amount: number;
  targetDate: string;
  isDownpayment: boolean;
  invoice: {
    id: string;
    number: string;
    status: string;
    amount: number;
    paid: number;
    balance: number;
    dueDate: string;
  } | null;
  paid: number;
  status: PaymentMilestoneStatus;
};

export type CostEstimateDto = {
  id: string;
  reference: string;
  status: EstimateStatus;
  customer: { id: string; name: string; email: string };
  designRequestId: string | null;
  /** Selected design name, or "120 sqm · Standard" for custom requests. */
  designLabel: string;
  floorArea: number | null;
  finish: string | null;
  preferredStartDate: string | null;
  neededBy: string | null;
  siteAddress: string;
  siteAddressDetails: AddressDetails | null;
  customerNotes: string;
  lineItems: EstimateLineItem[];
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  scheduleTemplate: MilestoneTemplate[];
  adminNotes: string;
  revisionNote: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  downpaymentPercent: number | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConstructionProjectDto = {
  id: string;
  reference: string;
  name: string;
  status: ProjectStatus;
  customer: { id: string; name: string };
  estimateId: string | null;
  estimateReference: string | null;
  contractPrice: number;
  subtotal: number;
  vat: number;
  downpaymentPercent: number | null;
  startDate: string | null;
  neededBy: string | null;
  paid: number;
  balance: number;
  milestones: PaymentMilestoneDto[];
  /** First milestone that is not fully paid. */
  nextMilestone: PaymentMilestoneDto | null;
  createdAt: string;
};

export type ConstructionRequestInput = {
  designRequestId: string;
  preferredStartDate: string;
  neededBy: string;
  siteAddress: AddressDetails;
  notes: string;
};

export type EstimateAction =
  | { action: "save"; lineItems: EstimateLineItemInput[]; scheduleTemplate: MilestoneTemplate[]; adminNotes: string }
  | { action: "send" }
  | { action: "request-revision"; reason: string }
  | { action: "accept"; downpaymentPercent: number };

export type ProjectStatusAction = { action: "status"; status: "Active" | "On hold" | "Completed" };
