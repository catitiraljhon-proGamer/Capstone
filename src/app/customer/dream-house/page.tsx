import { CustomerDreamHousePage } from "@/components/customer/customer-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dream House | G4 Builders Inc",
  robots: { index: false, follow: false },
  description: "Review your requested designs, get a construction cost estimate, and follow blueprint and project billing.",
};

type SearchParams = Promise<{ design?: string | string[]; designRequestId?: string | string[]; estimate?: string | string[] }>;

export default async function DreamHousePage({ searchParams }: { searchParams: SearchParams }) {
  const { design, designRequestId, estimate } = await searchParams;
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  return <CustomerDreamHousePage designId={first(design)} designRequestId={first(designRequestId)} estimateId={first(estimate)} />;
}
