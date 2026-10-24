import { SignInPage } from "@/components/auth/sign-in";
import { googleAuthErrorMessage } from "@/lib/google-auth-errors";
import {
  googleLinkCookieName,
  readGoogleLink,
} from "@/lib/server/google-oauth";
import type { Metadata } from "next";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Log In | G4 Builders Inc",
  description: "Sign in to your G4 Builders Inc account.",
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
    (params.signed_out === "idle" ? "You were signed out after a period of no activity. Sign in again to continue." : "") ||
    (params.signed_out === "restore" ? "A backup was restored and everyone was signed out. Sign in again to continue." : "") ||
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
