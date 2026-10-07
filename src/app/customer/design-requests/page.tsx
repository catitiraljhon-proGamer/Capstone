import { CustomerDesignRequestsPage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design Requests | G4 Builders Inc",
  description: "Customer design request and revision page.",
};

export default async function DesignRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ design?: string | string[] }>;
}) {
  const { design } = await searchParams;
  const houseDesignId = Array.isArray(design) ? design[0] : design;
  return <CustomerDesignRequestsPage houseDesignId={houseDesignId} />;
}
