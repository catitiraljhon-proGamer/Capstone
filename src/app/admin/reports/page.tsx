import { AdminReports } from "@/components/admin/admin-reports";
import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Reports | G4 Builders Inc",
  description: "Contract value, billing, and monthly collections across projects.",
};

export default function AdminReportsPage() {
  return (
    <AdminSectionPage
      activeLabel="Reports"
      title="Reports"
      description="Contract value, billing, and monthly collections across projects."
      mainContent={<AdminReports />}
    />
  );
}
