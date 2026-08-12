import { BillingClerkDashboard } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing Clerk Dashboard | G4 Builders Inc",
  description:
    "Billing clerk homepage for progress billings, customer balances, invoices, and payment tracking.",
};

export default function BillingClerkPage() {
  return <BillingClerkDashboard />;
}
