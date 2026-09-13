import { CustomerBillingPage } from "@/components/ui/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing Status | G4 Builders Inc",
  description: "Customer progress billing and payment status summary.",
};

export default function BillingPage() {
  return <CustomerBillingPage />;
}
