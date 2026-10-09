import { TwoFactorSettings } from "@/components/auth/two-factor-settings";
import { AdminSectionPage } from "@/components/staff/staff-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security | G4 Builders Inc",
  description: "Admin account security settings.",
  robots: { index: false, follow: false },
};

export default function AdminSecurityPage() {
  return (
    <AdminSectionPage
      activeLabel="Security"
      title="Security"
      description="Protect your admin account with two-factor authentication."
      mainContent={
        <div className="max-w-3xl">
          <TwoFactorSettings />
        </div>
      }
    />
  );
}
