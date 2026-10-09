import { CustomerSecurityPage } from "@/components/customer/customer-dashboard";
import { twoFactorContinuePath } from "@/lib/two-factor-policy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security | G4 Builders Inc",
  description: "Customer account security settings.",
  robots: { index: false, follow: false },
};

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return <CustomerSecurityPage continueTo={twoFactorContinuePath("customer", next)} />;
}
