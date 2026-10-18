import { BillingReports } from "@/components/billing/billing-reports";
import { BillingClerkSectionPage } from "@/components/staff/staff-dashboard";
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
      description="Contract value, monthly billing and collections, verified payments, and outstanding invoices."
      mainContent={<BillingReports />}
    />
  );
}
