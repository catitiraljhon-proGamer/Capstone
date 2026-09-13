import { AdminAuditLogViewer } from "@/components/ui/admin-audit-log-viewer";
import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audit Logs | G4 Builders Inc",
  description: "Admin audit log records.",
};

export default function AuditLogsPage() {
  return (
    <AdminSectionPage
      activeLabel="Audit Logs"
      title="Audit Logs"
      description="Monitor important system actions from admins, clients, and billing clerks."
      mainContent={<AdminAuditLogViewer />}
    />
  );
}
