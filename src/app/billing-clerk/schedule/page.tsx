import { BillingClerkSectionPage } from "@/components/staff/staff-dashboard";
import { StaffScheduleCalendar } from "@/components/staff/staff-schedule-calendar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schedule | G4 Builders Inc",
  description: "Billing clerk calendar of customer payment dates and follow-ups.",
};

export default function BillingClerkSchedulePage() {
  return (
    <BillingClerkSectionPage
      activeLabel="Schedule"
      title="Schedule"
      description="See every customer payment date and plan your payment follow-ups."
      mainContent={<StaffScheduleCalendar role="billing-clerk" />}
    />
  );
}
