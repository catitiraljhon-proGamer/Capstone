import { BillingDocument } from "@/components/ui/billing-document";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Invoice | G4 Builders Inc", robots: { index: false, follow: false } };
export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  return <BillingDocument id={(await params).id} customer={true} kind="invoice" />;
}
