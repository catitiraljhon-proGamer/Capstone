import { AdminHouseDesignManager } from "@/components/ui/admin-house-design-manager";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "House Designs | G4 Builders Inc",
  description: "Admin house design records.",
};

export default function HouseDesignsPage() {
  return <AdminHouseDesignManager />;
}
