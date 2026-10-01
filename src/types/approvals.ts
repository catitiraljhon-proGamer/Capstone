export const approvalRecordTypes = [
  "Design request",
  "Cost estimate",
  "Document",
] as const;

export type ApprovalRecordType = (typeof approvalRecordTypes)[number] | "Billing"; // Legacy billing approvals remain stored but are no longer actionable.

export const approvalStatuses = ["Pending", "Approved", "Rejected"] as const;

export type ApprovalStatus = (typeof approvalStatuses)[number];

export type ApprovalDto = {
  id: string;
  reference: string;
  recordType: ApprovalRecordType;
  recordId: string;
  status: ApprovalStatus;
  customer: {
    id: string;
    name: string;
    email: string;
  };
  subject: string;
  description: string;
  sourceStatus: string | null;
  sourceAvailable: boolean;
  inspirationImages?: string[];
  completedDesignImages?: string[];
  completedAt?: string;
  amount?: number;
  createdAt: string;
  reviewedAt?: string;
  reviewedByName?: string;
  reviewNote?: string;
};

export type ApprovalSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};
