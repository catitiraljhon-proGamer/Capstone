import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Users & Roles | G4 Builders Inc",
  description: "Admin users and roles.",
};

export default function UsersRolesPage() {
  return (
    <AdminSectionPage
      activeLabel="Users & Roles"
      title="Users & Roles"
      description="Manage customer, billing clerk, and admin access."
    />
  );
}
