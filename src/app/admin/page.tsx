import { AdminDashboard } from "@/components/staff/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard | G4 Builders Inc",
  description:
    "Admin homepage for project approvals, user roles, billing control, and reports.",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
