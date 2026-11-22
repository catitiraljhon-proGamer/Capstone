import { CustomerAccountPage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manage Account | G4 Builders Inc",
  description: "Update your client information.",
};

export default function ManageAccountPage() {
  return <CustomerAccountPage tab="profile" />;
}
