"use client";

import { useState } from "react";
import { TermsDialog } from "@/components/customer/terms-dialog";
import { useAccountTerms } from "@/lib/use-account-terms";

/** Read-only Terms and Conditions, opened from the login page or a design request. */
export function AccountTermsDialog({ onClose }: { onClose: () => void }) {
  const { terms, failed, retry } = useAccountTerms();
  return (
    <TermsDialog terms={terms} loadFailed={failed} onRetry={retry} declineLabel="Close" helperText="" onDecline={onClose} onClose={onClose} />
  );
}

/**
 * Opens from the terms checkbox on the register page. I Agree sits after the last term, so the customer scrolls
 * through the terms to reach it, and agreeing ticks the checkbox. The agreement is saved with the new account, so
 * these terms are never asked again.
 */
export function AccountTermsConsent({ onAgree, onDecline }: { onAgree: (version: string) => void; onDecline: () => void }) {
  const { terms, failed, retry } = useAccountTerms();
  return (
    <TermsDialog
      terms={terms} loadFailed={failed} onRetry={retry} onAgree={onAgree} onDecline={onDecline}
      agreeAtEnd agreeLabel="I Agree" declineLabel="Go Back"
      helperText="You only agree once. Your agreement is saved with your new account."
    />
  );
}

/** "By signing in…" note with a link to read the terms before logging in. */
export function AccountTermsNotice() {
  const [reading, setReading] = useState(false);
  return (
    <>
      <p className="text-center text-xs leading-5 text-stone-500">
        By signing in, you agree to the G4 Builders Inc{" "}
        <button type="button" onClick={() => setReading(true)} aria-haspopup="dialog"
          className="rounded font-semibold text-red-700 underline underline-offset-4 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-red-600">
          Terms and Conditions
        </button>.
      </p>
      {reading && <AccountTermsDialog onClose={() => setReading(false)} />}
    </>
  );
}
