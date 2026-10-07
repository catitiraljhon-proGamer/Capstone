import { BillingClerkSecurityPage } from "@/components/staff/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security | G4 Builders Inc",
  description: "Billing clerk account security settings.",
  robots: { index: false, follow: false },
};

export default function BillingClerkSecurity() {
  return <BillingClerkSecurityPage />;
}
