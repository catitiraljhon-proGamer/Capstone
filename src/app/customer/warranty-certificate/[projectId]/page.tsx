import { WarrantyCertificate } from "@/components/customer/warranty-certificate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Warranty Certificate | G4 Builders Inc", robots: { index: false, follow: false } };

export default async function CustomerWarrantyCertificatePage({ params }: { params: Promise<{ projectId: string }> }) {
  return <WarrantyCertificate projectId={(await params).projectId} backHref="/customer/dream-house" backLabel="Back to Dream House" />;
}
