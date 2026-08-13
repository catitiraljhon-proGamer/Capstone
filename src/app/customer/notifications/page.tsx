import { CustomerNotificationsPage } from "@/components/ui/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications | G4 Builders Inc",
  description: "Customer notifications and reminders.",
};

export default function NotificationsPage() {
  return <CustomerNotificationsPage />;
}
