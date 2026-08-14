import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cost Estimates | G4 Builders Inc",
  description: "Admin cost estimate records.",
};

export default function CostEstimatesPage() {
  return (
    <AdminSectionPage
      activeLabel="Cost Estimates"
      title="Cost Estimates"
      description="Review estimate records connected to approved house design requests."
    />
  );
}
