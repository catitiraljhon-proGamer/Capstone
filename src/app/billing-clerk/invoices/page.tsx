import { BillingClerkSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoices | G4 Builders Inc",
  description: "Billing clerk invoices.",
};

export default function InvoicesPage() {
  return (
    <BillingClerkSectionPage
      activeLabel="Invoices"
      title="Invoices"
      description="Prepare, review, and organize customer invoices."
    />
  );
}
