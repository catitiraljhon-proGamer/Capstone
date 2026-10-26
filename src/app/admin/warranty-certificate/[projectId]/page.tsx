import { WarrantyCertificate } from "@/components/customer/warranty-certificate";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Warranty Certificate | G4 Builders Inc", robots: { index: false, follow: false } };

export default async function AdminWarrantyCertificatePage({ params }: { params: Promise<{ projectId: string }> }) {
  return <WarrantyCertificate projectId={(await params).projectId} backHref="/admin/projects?tab=warranty" backLabel="Back to Warranty Claims" />;
}
