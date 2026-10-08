import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import { AdminCostEstimates } from "@/components/admin/admin-cost-estimates";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cost Estimates | G4 Builders Inc",
  description: "Prepare construction cost estimates, BOQs, and payment schedules.",
};

export default async function CostEstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ estimate?: string | string[] }>;
}) {
  const { estimate } = await searchParams;
  const initialEstimateId = Array.isArray(estimate) ? estimate[0] : estimate;

  return (
    <AdminSectionPage
      activeLabel="Cost Estimates"
      title="Cost Estimates"
      description="Prepare BOQ cost estimates and payment schedules for construction requests."
      mainContent={<AdminCostEstimates initialEstimateId={initialEstimateId ?? null} />}
    >
    </AdminSectionPage>
  );
}
