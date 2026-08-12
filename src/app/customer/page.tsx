import { CustomerDashboard } from "@/components/ui/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Dashboard | G4 Builders Inc",
  description:
    "Customer homepage for house design progress, billing, messages, and documents.",
};

export default function CustomerPage() {
  return <CustomerDashboard />;
}
