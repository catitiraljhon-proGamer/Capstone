import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Notifications | G4 Builders Inc",
  description: "Customer notifications and reminders.",
};

export default function NotificationsPage() {
  redirect("/customer");
}
