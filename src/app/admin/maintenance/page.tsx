import { AdminMaintenance } from "@/components/admin/admin-maintenance";
import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Maintenance | G4 Builders Inc",
  description: "Maintain finishes, house types, exterior items and prices, and download database backups.",
};

export default function AdminMaintenancePage() {
  return (
    <AdminSectionPage
      activeLabel="Maintenance"
      title="Maintenance"
      description="Maintain finishes, house types, exterior items and prices, and download database backups."
      mainContent={<AdminMaintenance />}
    />
  );
}
