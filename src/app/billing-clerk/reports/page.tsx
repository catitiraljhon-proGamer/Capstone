import { BillingClerkSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing Reports | G4 Builders Inc",
  description: "Billing clerk reports.",
};

export default function BillingReportsPage() {
  return (
    <BillingClerkSectionPage
      activeLabel="Reports"
      title="Reports"
      description="Generate billing, payment, invoice, and collection reports."
    />
  );
}
