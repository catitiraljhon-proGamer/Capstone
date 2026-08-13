import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Approvals | G4 Builders Inc",
  description: "Admin approval queue.",
};

export default function ApprovalsPage() {
  return (
    <AdminSectionPage
      activeLabel="Approvals"
      title="Approvals"
      description="Review pending design, estimate, billing, and document approvals."
    />
  );
}
