import { CustomerDocumentsPage } from "@/components/ui/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documents | G4 Builders Inc",
  description: "Customer documents, plans, approvals, and reports.",
};

export default function DocumentsPage() {
  return <CustomerDocumentsPage />;
}
