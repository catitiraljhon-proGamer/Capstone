import { AdminSectionPage } from "@/components/ui/staff-dashboard";
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
      description="View registered clients and their connected project records."
    />
  );
}
