"use client";

import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { TermsDialog } from "@/components/customer/terms-dialog";
import { accountTerms, type AccountTermsAcceptance } from "@/lib/account-terms";

/**
 * Asks a customer to agree to the Terms and Conditions once, after sign-in, when their account has no agreement yet
 * (accounts created before the terms moved to registration, or signed up with Google from the login page).
 * Accounts that already agreed never see it again.
 */
export function AccountTermsGate() {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/account/terms", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<{ accepted?: boolean }> : null))
      .then((payload) => { if (active && payload && !payload.accepted) setRequired(true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!required) return null;
  return (
    <TermsDialog<AccountTermsAcceptance>
      terms={accountTerms}
      notice={{ title: "Protected Designs · Only the Blueprint Is Paid", body: accountTerms.notice, icon: ShieldAlert }}
      acceptUrl="/api/account/terms"
      declineLabel="Decline and Sign Out"
      helperText="You only need to agree once. Declining signs you out."
      // Reload so pages fetched before agreeing (such as full design galleries) load with access.
      onAccept={() => window.location.reload()}
      onDecline={() => {
        void fetch("/api/auth/logout", { method: "DELETE" }).finally(() => window.location.replace("/login"));
      }}
    />
  );
}
