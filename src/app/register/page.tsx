import { RegisterAccountPage } from "@/components/ui/register-account";
import { googleAuthErrorMessage } from "@/lib/google-auth-errors";
import { readSession } from "@/lib/server/session";
import { roleHomePaths } from "@/types/domain";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Create Client Account | G4 Builders Inc",
  description: "Register for a G4 Builders Inc client account.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readSession();

  if (session) {
    redirect(roleHomePaths[session.role]);
  }

  const params = await searchParams;
  const error = googleAuthErrorMessage(params.google_error);
  return <RegisterAccountPage key={error} initialError={error} />;
}
