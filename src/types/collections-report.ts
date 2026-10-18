import type { PaymentMethod } from "@/types/billing";
import type { ProjectStatus } from "@/types/construction";

/** Current billing position of one project. Amounts cover issued, non-void invoices and verified payments. */
export type ProjectCollectionRow = {
  id: string;
  reference: string;
  name: string;
  customerName: string;
  status: ProjectStatus;
  contractPrice: number;
  billed: number;
  collected: number;
  outstanding: number;
  overdue: number;
};

/** An issued, non-void invoice; `projectId` is empty for design and blueprint fees. */
export type InvoicedEntry = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  projectId: string;
  projectName: string;
  label: string;
  issuedOn: string;
  dueDate: string;
  amount: number;
  paid: number;
  balance: number;
  status: string;
};

/** A verified payment; `projectId` is empty for design and blueprint fees. */
export type CollectedEntry = {
  id: string;
  reference: string;
  customerName: string;
  projectId: string;
  projectName: string;
  invoiceNumber: string;
  paidOn: string;
  method: PaymentMethod;
  amount: number;
  receiptNumber: string;
};

export type CollectionsReport = {
  projects: ProjectCollectionRow[];
  invoiced: InvoicedEntry[];
  collected: CollectedEntry[];
};
