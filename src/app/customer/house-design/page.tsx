import { CustomerHouseDesignPage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My House Design | G4 Builders Inc",
  robots: { index: false, follow: false },
  description: "View your requested house designs after verified payment.",
};

export default function HouseDesignPage() {
  return <CustomerHouseDesignPage />;
}
