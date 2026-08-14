import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import { AdminHouseDesignManager } from "@/components/ui/admin-house-design-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "House Designs | G4 Builders Inc",
  description: "Admin house design records.",
};

export default function HouseDesignsPage() {
  return (
    <AdminSectionPage
      activeLabel="House Designs"
      title="House Designs"
      description="Review house design submissions and design-related project records."
      mainContent={<AdminHouseDesignManager />}
    />
  );
}
