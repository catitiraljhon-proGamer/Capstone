import { BillingDocument } from "@/components/billing/billing-document";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Payment Receipt | G4 Builders Inc", robots: { index: false, follow: false } };
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  return <BillingDocument id={(await params).id} customer={false} kind="receipt" />;
}
