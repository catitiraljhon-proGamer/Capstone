import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Reports | G4 Builders Inc",
  description: "Admin reports.",
};

export default function AdminReportsPage() {
  return (
    <AdminSectionPage
      activeLabel="Reports"
      title="Reports"
      description="Generate project, estimate, billing, approval, and user reports."
    />
  );
}
