import { TwoFactorSettings } from "@/components/auth/two-factor-settings";
import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import { twoFactorContinuePath } from "@/lib/two-factor-policy";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security | G4 Builders Inc",
  description: "Admin account security settings.",
  robots: { index: false, follow: false },
};

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <AdminSectionPage
      activeLabel="Security"
      title="Security"
      description="Protect your admin account with two-factor authentication."
      mainContent={
        <div className="max-w-3xl">
          <TwoFactorSettings continueTo={twoFactorContinuePath("admin", next)} />
        </div>
      }
    />
  );
}
