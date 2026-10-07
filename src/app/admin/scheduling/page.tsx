import { AdminSchedulingCalendar } from "@/components/admin/admin-scheduling-calendar";
import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scheduling | G4 Builders Inc",
  description: "Admin calendar for client meetings.",
};

export default function SchedulingPage() {
  return (
    <AdminSectionPage
      activeLabel="Scheduling"
      title="Scheduling"
      description="Plan client meetings and project discussions."
      mainContent={<AdminSchedulingCalendar />}
    />
  );
}
