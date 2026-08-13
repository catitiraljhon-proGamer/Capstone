import { BillingClerkSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payments | G4 Builders Inc",
  description: "Billing clerk payment records.",
};

export default function PaymentsPage() {
  return (
    <BillingClerkSectionPage
      activeLabel="Payments"
      title="Payments"
      description="Track customer payment submissions and collection status."
    />
  );
}
