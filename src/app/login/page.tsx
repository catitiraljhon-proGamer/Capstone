import { SignInPage } from "@/components/auth/sign-in";
import { longManilaDate } from "@/lib/account-closure";
import { getDatabase } from "@/lib/database/mongodb";
import { googleAuthErrorMessage } from "@/lib/google-auth-errors";
import {
  findReactivation,
  reactivationCookieName,
  toReactivationDto,
} from "@/lib/server/account-closure";
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

/** "Sign in before January 18, 2027" for the `deactivated=2027-01-18` the Manage Account page sends here. */
function deactivatedNotice(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const deletesAt = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(deletesAt.getTime())) return "";
  return `Your account is deactivated. Sign in before ${longManilaDate(deletesAt)} to reactivate it.`;
}

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
  // A deactivated customer back from Google sign-in chooses whether to reactivate.
  const waiting =
    params.reactivate === "1"
      ? await findReactivation(
          await getDatabase(),
          cookieStore.get(reactivationCookieName)?.value,
        ).catch(() => null)
      : null;
  const reactivation = waiting ? toReactivationDto(waiting.user) : undefined;
  const error =
    (params.signed_out === "idle" ? "You were signed out after a period of no activity. Sign in again to continue." : "") ||
    (params.signed_out === "restore" ? "A backup was restored and everyone was signed out. Sign in again to continue." : "") ||
    googleAuthErrorMessage(params.google_error) ||
    (params.google_link === "1" && !link
      ? googleAuthErrorMessage("expired")
      : "") ||
    (params.reactivate === "1" && !reactivation
      ? "Your sign-in expired. Sign in again to reactivate your account."
      : "");
  const notice =
    deactivatedNotice(params.deactivated) ||
    (params.deleted === "1" ? "Your account has been deleted. Thank you for building with G4 Builders Inc." : "");
  return (
    <SignInPage
      key={`${link?.email ?? "login"}:${error}:${notice}:${reactivation ? "reactivate" : ""}`}
      initialError={error}
      googleLinkEmail={link?.email}
      initialRememberMe={link?.rememberMe}
      notice={notice}
      initialReactivation={reactivation}
    />
  );
}
