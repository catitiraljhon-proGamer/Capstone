import { CustomerFinishedDesignsPage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Finished Designs | G4 Builders Inc",
  description: "Browse published house designs for inspiration.",
  robots: { index: false, follow: false },
};
export default function FinishedDesignsPage() { return <CustomerFinishedDesignsPage />; }
