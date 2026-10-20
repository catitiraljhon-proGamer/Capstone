import { ResetPasswordPage } from "@/components/auth/reset-password";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Password | G4 Builders Inc",
  description: "Set a new password for your G4 Builders Inc account.",
  robots: { index: false, follow: false },
  // The reset token is in the address; keep it out of Referer headers.
  referrer: "no-referrer",
};

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordPage token={typeof token === "string" ? token : ""} />;
}
