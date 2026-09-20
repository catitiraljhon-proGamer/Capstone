import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import { AdminClientManager } from "@/components/ui/admin-client-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client | G4 Builders Inc",
  description: "Admin client records.",
};

export default function ClientsPage() {
  return (
    <AdminSectionPage
      activeLabel="Client"
      title="Client"
      description="Manage client names, ages, addresses, and contact information."
      mainContent={<AdminClientManager />}
    />
  );
}
