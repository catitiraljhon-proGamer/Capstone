import { SignInPage } from "@/components/auth/sign-in";
import { googleAuthErrorMessage } from "@/lib/google-auth-errors";
import {
  googleLinkCookieName,
  readGoogleLink,
} from "@/lib/server/google-oauth";
import {
  readTwoFactorChallenge,
  twoFactorChallengeCookieName,
} from "@/lib/server/two-factor";
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
  const twoFactorPending =
    params.two_factor === "1" &&
    Boolean(
      await readTwoFactorChallenge(
        cookieStore.get(twoFactorChallengeCookieName)?.value,
      ),
    );
  const error =
    googleAuthErrorMessage(params.google_error) ||
    ((params.google_link === "1" && !link) ||
    (params.two_factor === "1" && !twoFactorPending)
      ? googleAuthErrorMessage("expired")
      : "");
  return (
    <SignInPage
      key={`${link?.email ?? "login"}:${twoFactorPending}:${error}`}
      initialError={error}
      googleLinkEmail={link?.email}
      initialRememberMe={link?.rememberMe}
      twoFactorPending={twoFactorPending}
    />
  );
}
