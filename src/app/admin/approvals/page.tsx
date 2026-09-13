import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import { AdminApprovalsManager } from "@/components/ui/admin-approvals-manager";
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
      mainContent={<AdminApprovalsManager />}
    />
  );
}
