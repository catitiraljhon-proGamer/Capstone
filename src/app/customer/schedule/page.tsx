import { CustomerSchedulePage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Schedule | G4 Builders Inc",
  description: "Customer meetings, payment due dates, and meeting requests.",
};

export default function SchedulePage() {
  return <CustomerSchedulePage />;
}
