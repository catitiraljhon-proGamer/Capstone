import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing Control | G4 Builders Inc",
  description: "Admin billing control.",
};

export default function BillingControlPage() {
  return (
    <AdminSectionPage
      activeLabel="Billing Control"
      title="Billing Control"
      description="Oversee progress billing, invoices, balances, and payment health."
    />
  );
}
