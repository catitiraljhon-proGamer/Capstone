import { BillingClerkSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Accounts | G4 Builders Inc",
  description: "Billing clerk customer accounts.",
};

export default function CustomerAccountsPage() {
  return (
    <BillingClerkSectionPage
      activeLabel="Customer Accounts"
      title="Customer Accounts"
      description="Review customer billing profiles, balances, and account status."
    />
  );
}
