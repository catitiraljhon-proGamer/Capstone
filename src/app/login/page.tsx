import { SignInPage } from "@/components/ui/sign-in";
import { googleAuthErrorMessage } from "@/lib/google-auth-errors";
import {
  googleLinkCookieName,
  readGoogleLink,
} from "@/lib/server/google-oauth";
import type { Metadata } from "next";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Log In | G4 Builders Inc",
  description: "Access the G4 Builders Inc cost estimation and billing system.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const link =
    params.google_link === "1"
      ? await readGoogleLink(cookieStore.get(googleLinkCookieName)?.value)
      : null;
  const error =
    googleAuthErrorMessage(params.google_error) ||
    (params.google_link === "1" && !link
      ? googleAuthErrorMessage("expired")
      : "");
  return (
    <SignInPage
      key={`${link?.email ?? "login"}:${error}`}
      initialError={error}
      googleLinkEmail={link?.email}
      initialRememberMe={link?.rememberMe}
    />
  );
}
