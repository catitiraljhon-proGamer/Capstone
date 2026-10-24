import { AdminMaintenance } from "@/components/admin/admin-maintenance";
import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Maintenance | G4 Builders Inc",
  description: "Maintenance mode, account security, email codes, notification and reminder settings, Contact Us details, Terms and Conditions, the home page slideshow, and database backups.",
};

export default function AdminMaintenancePage() {
  return (
    <AdminSectionPage
      activeLabel="Maintenance"
      title="Maintenance"
      description="Maintenance mode, account security, email codes, notification and reminder settings, Contact Us details, Terms and Conditions, the home page slideshow, and database backups."
      mainContent={<AdminMaintenance />}
    />
  );
}
