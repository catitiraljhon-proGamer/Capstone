import { CustomerProjectPage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Project | G4 Builders Inc",
  robots: { index: false, follow: false },
  description: "Request construction, review your cost estimate, and follow your project payments.",
};

export default async function ProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ designRequestId?: string | string[]; estimate?: string | string[] }>;
}) {
  const { designRequestId, estimate } = await searchParams;
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  return <CustomerProjectPage designRequestId={first(designRequestId)} estimateId={first(estimate)} />;
}
