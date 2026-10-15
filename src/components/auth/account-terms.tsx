"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { TermsDialog } from "@/components/customer/terms-dialog";
import { accountTerms } from "@/lib/account-terms";

const notice = { title: "Protected designs · Only the blueprint is paid", body: accountTerms.notice, icon: ShieldAlert };

/** Read-only Terms and Conditions, opened from the login page or a design request. */
export function AccountTermsDialog({ onClose }: { onClose: () => void }) {
  return <TermsDialog terms={accountTerms} notice={notice} declineLabel="Close" helperText="" onDecline={onClose} onClose={onClose} />;
}

/**
 * Opens first on the register page: the sign-up form can be filled in only after the customer agrees. The agreement
 * is saved with the new account, so these terms are never asked again.
 */
export function AccountTermsConsent({ onAgree, onDecline }: { onAgree: () => void; onDecline: () => void }) {
  return (
    <TermsDialog
      terms={accountTerms} notice={notice} onAgree={onAgree} onDecline={onDecline}
      agreeLabel="I agree, continue to sign up" declineLabel="Go back"
      helperText="You only agree once. Next, fill in your details to create your account."
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
