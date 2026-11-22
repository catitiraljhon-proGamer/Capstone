import { CustomerAccountPage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deactivate or Delete | G4 Builders Inc",
  description: "Deactivate or delete your G4 Builders account.",
};

export default function DeactivateAccountPage() {
  return <CustomerAccountPage tab="close" />;
}
