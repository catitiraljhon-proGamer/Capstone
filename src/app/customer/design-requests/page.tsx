import { CustomerDesignRequestsPage } from "@/components/ui/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design Requests | G4 Builders Inc",
  description: "Customer design request and revision page.",
};

export default function DesignRequestsPage() {
  return <CustomerDesignRequestsPage />;
}
