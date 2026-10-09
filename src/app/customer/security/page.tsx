import { CustomerSecurityPage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security | G4 Builders Inc",
  description: "Customer account security settings.",
  robots: { index: false, follow: false },
};

export default function SecurityPage() {
  return <CustomerSecurityPage />;
}
