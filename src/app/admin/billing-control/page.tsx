import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing | G4 Builders Inc",
  description: "Admin billing records.",
};

export default function BillingControlPage() {
  return (
    <AdminSectionPage
      activeLabel="Billing"
      title="Billing"
      description="Oversee progress billing, invoices, balances, and payment health."
    />
  );
}
