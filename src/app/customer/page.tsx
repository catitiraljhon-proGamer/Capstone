import { CustomerDashboard } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Dashboard | G4 Builders Inc",
  description:
    "Customer homepage for house design progress, cost estimates, and billing.",
};

export default function CustomerPage() {
  return <CustomerDashboard />;
}
