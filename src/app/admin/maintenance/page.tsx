import { AdminMaintenance, type MaintenanceSection } from "@/components/admin/admin-maintenance";
import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Maintenance | G4 Builders Inc",
  description: "Maintenance mode, account security, email codes, notification and reminder settings, room sizes for the floor area warning, the warranty, materials and their prices, Contact Us details, Terms and Conditions, the home page slideshow, the About Us page with its team, and database backups.",
};

/** Sections another page may link to with ?section=…; others open on Maintenance mode. */
const linkableSections: MaintenanceSection[] = ["warranty", "materials"];

export default async function AdminMaintenancePage({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
  const { section } = await searchParams;
  const wanted = (Array.isArray(section) ? section[0] : section) as MaintenanceSection | undefined;
  return (
    <AdminSectionPage
      activeLabel="Maintenance"
      title="Maintenance"
      description="Maintenance mode, account security, email codes, notification and reminder settings, room sizes for the floor area warning, the warranty, materials and their prices, Contact Us details, Terms and Conditions, the home page slideshow, the About Us page with its team, and database backups."
      mainContent={<AdminMaintenance initialSection={wanted && linkableSections.includes(wanted) ? wanted : "mode"} />}
    />
  );
}
