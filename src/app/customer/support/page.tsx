import { CustomerSupportPage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support | G4 Builders Inc",
  description: "Customer support requests.",
};

export default function SupportPage() {
  return <CustomerSupportPage />;
}
