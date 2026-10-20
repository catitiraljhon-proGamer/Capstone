import { ForgotPasswordPage } from "@/components/auth/forgot-password";
import { readSession } from "@/lib/server/session";
import { roleHomePaths } from "@/types/domain";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Forgot Password | G4 Builders Inc",
  description: "Request a link to reset your G4 Builders Inc account password.",
};

export default async function ForgotPassword() {
  const session = await readSession();

  if (session) {
    redirect(roleHomePaths[session.role]);
  }

  return <ForgotPasswordPage />;
}
