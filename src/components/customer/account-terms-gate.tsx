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
export function AccountTermsGate({ userId }: { userId: string }) {
  const [required, setRequired] = useState(false);
  // An agreement is permanent, so once this tab has seen it, other pages skip the check.
  const storageKey = `g4-terms-accepted:${userId}:${accountTerms.version}`;

  useEffect(() => {
    if (readAccepted(storageKey)) return;
    let active = true;
    fetch("/api/account/terms", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<{ accepted?: boolean }> : null))
      .then((payload) => {
        if (!active || !payload) return;
        if (payload.accepted) saveAccepted(storageKey);
        else setRequired(true);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [storageKey]);

  if (!required) return null;
  return (
    <TermsDialog<AccountTermsAcceptance>
      terms={accountTerms}
      notice={{ title: "Protected Designs · Only the Blueprint Is Paid", body: accountTerms.notice, icon: ShieldAlert }}
      acceptUrl="/api/account/terms"
      declineLabel="Decline and Sign Out"
      helperText="You only need to agree once. Declining signs you out."
      // Reload so pages fetched before agreeing (such as full design galleries) load with access.
      onAccept={() => { saveAccepted(storageKey); window.location.reload(); }}
      onDecline={() => {
        void fetch("/api/auth/logout", { method: "DELETE" }).finally(() => window.location.replace("/login"));
      }}
    />
  );
}

function readAccepted(key: string) {
  try { return window.sessionStorage.getItem(key) === "1"; } catch { return false; }
}

function saveAccepted(key: string) {
  try { window.sessionStorage.setItem(key, "1"); } catch { /* storage unavailable: the check simply runs again */ }
}
