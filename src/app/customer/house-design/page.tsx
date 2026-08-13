import { CustomerHouseDesignPage } from "@/components/ui/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My House Design | G4 Builders Inc",
  description: "Customer house design comparison and estimate preview.",
};

export default function HouseDesignPage() {
  return <CustomerHouseDesignPage />;
}
