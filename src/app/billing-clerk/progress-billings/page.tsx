import { BillingClerkSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Progress Billings | G4 Builders Inc",
  description: "Billing clerk progress billing records.",
};

export default function ProgressBillingsPage() {
  return (
    <BillingClerkSectionPage
      activeLabel="Progress Billings"
      title="Progress Billings"
      description="Prepare and monitor progress-based customer billings."
    />
  );
}
