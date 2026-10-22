import type { PaymentMilestoneDto } from "@/types/construction";
import type { PaymongoMethod } from "@/types/paymongo";

export const paymentMethods = ["Cash", "Bank transfer", "Card", "E-wallet", "Cheque"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
/** What customers submit for verification; card and e-wallet payments go through Pay online, and cash is recorded by the Billing Clerk. */
export const customerPaymentMethods = ["Bank transfer", "Cheque"] as const satisfies readonly PaymentMethod[];
export type CustomerPaymentMethod = (typeof customerPaymentMethods)[number];
export const isCustomerPaymentMethod = (method: PaymentMethod): method is CustomerPaymentMethod =>
  (customerPaymentMethods as readonly PaymentMethod[]).includes(method);
/** Payments saved before the "Cheque" spelling may still read "Check" in MongoDB. */
export type StoredPaymentMethod = PaymentMethod | "Check";

export type DesignFeeType = "design" | "blueprint";

export const designFeeLabels: Record<DesignFeeType, string> = { design: "Design fee", blueprint: "Blueprint fee" };

export function normalizePaymentMethod(method: StoredPaymentMethod): PaymentMethod {
  return method === "Check" ? "Cheque" : method;
}
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
  /** Set on design-request invoices: a legacy design fee or a blueprint fee. */
  feeType?: DesignFeeType;
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
  status: "Draft" | "Sent" | "Partially Paid" | "Paid" | "Overdue" | "Void";
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
  /** Present for online payments made through the (simulated) PayMongo checkout. */
  gateway?: { provider: "paymongo"; method: PaymongoMethod; sessionId: string; livemode: boolean };
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

/** A cash payment as listed in the Billing Clerk's cash total and in a daily cash report. */
export type CashReportPayment = {
  id: string;
  reference: string;
  receiptNumber?: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  /** Void ("Reversed") cash stays listed but is not expected in the drawer. */
  status: "Verified" | "Reversed";
  paidAt: string;
  reversalReason?: string;
};

/** Cash the Billing Clerk recorded that no daily cash report has counted yet. */
export type CashDrawer = {
  payments: CashReportPayment[];
  expected: number;
};

/** The Billing Clerk's counted cash for the day, which the Admin verifies when the cash is handed over. */
export type CashReport = {
  id: string;
  reference: string;
  clerkName: string;
  /** YYYY-MM-DD, Manila time. */
  businessDate: string;
  expected: number;
  counted: number;
  /** Counted minus expected: negative when short, positive when over. */
  difference: number;
  explanation?: string;
  status: "Pending" | "Verified";
  submittedAt: string;
  verifiedAt?: string;
  verifiedByName?: string;
  adminNote?: string;
  payments: CashReportPayment[];
};

export type BillingData = {
  designRequests: { id: string; customerName: string; label: string; feeType: DesignFeeType; invoiceId?: string }[];
  projects: BillingProject[];
  invoices: BillingInvoice[];
  payments: BillingPayment[];
  /** Billing Clerk only: cash not counted yet and the clerk's recent daily cash reports. */
  cashDrawer?: CashDrawer;
  cashReports?: CashReport[];
};

/** A customer payment date shown read-only on the admin calendar; billing itself stays with the Billing Clerk. */
export type PaymentDueDto = {
  id: string;
  kind: "Downpayment" | "Progress billing" | "Blueprint fee" | "Design fee";
  label: string;
  clientId: string;
  clientName: string;
  projectName: string;
  /** YYYY-MM-DD */
  dueDate: string;
  amount: number;
  balance: number;
  /** Upcoming = scheduled milestone not invoiced yet; Due = invoiced and unpaid. */
  status: "Upcoming" | "Due" | "Partially paid" | "Paid" | "Overdue";
  invoiceNumber?: string;
};

export type BillingReceipt = {
  receipt: ReceiptSnapshot;
  status: "Verified" | "Reversed";
  reversalReason?: string;
  reversedAt?: string;
};
