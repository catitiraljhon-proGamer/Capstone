import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import { StaffScheduleCalendar } from "@/components/staff/staff-schedule-calendar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scheduling | G4 Builders Inc",
  description: "Admin calendar for client meetings, meeting requests, and customer payment dates.",
};

export default function SchedulingPage() {
  return (
    <AdminSectionPage
      activeLabel="Scheduling"
      title="Scheduling"
      description="Plan client meetings, answer meeting requests, and see customer payment dates."
      mainContent={<StaffScheduleCalendar role="admin" />}
    />
  );
}
