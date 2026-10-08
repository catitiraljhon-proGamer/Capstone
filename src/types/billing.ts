import type { PaymentMilestoneDto } from "@/types/construction";

export const paymentMethods = ["Cash", "Bank transfer", "Card", "E-wallet", "Check"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export type BillingSection = "Dashboard" | "Progress Billings" | "Invoices" | "Payments" | "Customer Accounts" | "Reports";

export type ReceiptSnapshot = {
  number: string;
  customerName: string;
  projectName: string;
  invoiceNumber: string;
  invoiceLabel: string;
  invoiceAmount: number;
  amount: number;
  balanceAfterPayment: number;
  method: PaymentMethod;
  transactionReference: string;
  paidAt: string;
  issuedAt: string;
  verifiedByName: string;
};

export type BillingInvoice = {
  id: string;
  invoiceNumber: string;
  projectId: string;
  designRequestId?: string;
  milestoneId?: string;
  customerId: string;
  customerName: string;
  projectName: string;
  label: string;
  basis: string;
  progressPercentage: number;
  amount: number;
  paid: number;
  balance: number;
  dueDate: string;
  status: "Draft" | "Ready" | "Sent" | "Partially Paid" | "Paid" | "Overdue" | "Void";
  overdue: boolean;
  issuedAt?: string;
  voidReason?: string;
};

export type BillingPayment = {
  id: string;
  reference: string;
  invoiceId: string | null;
  invoiceNumber: string;
  projectId: string;
  customerId: string;
  customerName: string;
  projectName: string;
  amount: number;
  method: PaymentMethod;
  status: "Pending" | "Verified" | "Rejected" | "Reversed";
  paidAt: string;
  transactionReference: string;
  notes: string;
  hasProof: boolean;
  reviewNote?: string;
  receiptNumber?: string;
  reversalReason?: string;
};

export type BillingProject = {
  id: string;
  reference: string;
  name: string;
  customerId: string;
  customerName: string;
  status: string;
  contractPrice: number;
  allocated: number;
  billed: number;
  paid: number;
  outstanding: number;
  /** Payment schedule for projects created from an accepted estimate; empty for legacy projects. */
  milestones: PaymentMilestoneDto[];
};

export type BillingData = {
  designRequests: { id: string; customerName: string; label: string; invoiceId?: string }[];
  projects: BillingProject[];
  invoices: BillingInvoice[];
  payments: BillingPayment[];
  activity: { id: string; action: string; actorName: string; date: string }[];
};

export type BillingReceipt = {
  receipt: ReceiptSnapshot;
  status: "Verified" | "Reversed";
  reversalReason?: string;
  reversedAt?: string;
};
