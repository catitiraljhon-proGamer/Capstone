import { AdminSchedulingCalendar } from "@/components/ui/admin-scheduling-calendar";
import { AdminSectionPage } from "@/components/ui/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scheduling | G4 Builders Inc",
  description: "Admin calendar for client meetings and payment schedules.",
};

export default function SchedulingPage() {
  return (
    <AdminSectionPage
      activeLabel="Scheduling"
      title="Scheduling"
      description="Plan client meetings and track upcoming payment commitments."
      mainContent={<AdminSchedulingCalendar />}
    />
  );
}
