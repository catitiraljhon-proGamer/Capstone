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
export type InvoicedEntry = { projectId: string; issuedOn: string; amount: number };

/** A verified payment; `projectId` is empty for design and blueprint fees. */
export type CollectedEntry = { projectId: string; paidOn: string; amount: number };

export type AdminCollectionsReport = {
  projects: ProjectCollectionRow[];
  invoiced: InvoicedEntry[];
  collected: CollectedEntry[];
};
