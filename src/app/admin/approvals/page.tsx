import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import { AdminApprovalsManager } from "@/components/admin/admin-approvals-manager";
import { AdminCashReports } from "@/components/admin/admin-cash-reports";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Approvals | G4 Builders Inc",
  description: "Admin approval queue and daily cash reports.",
};

export default function ApprovalsPage() {
  return (
    <AdminSectionPage
      activeLabel="Approvals"
      title="Approvals"
      description="Verify daily cash reports and review pending design, estimate, and document approvals."
      mainContent={<div className="space-y-6"><AdminCashReports /><AdminApprovalsManager /></div>}
    />
  );
}
