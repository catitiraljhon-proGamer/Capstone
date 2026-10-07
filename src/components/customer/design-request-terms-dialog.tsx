"use client";

import { LockKeyhole } from "lucide-react";
import { TermsDialog } from "@/components/customer/terms-dialog";
import { designRequestTerms, type DesignTermsAcceptance } from "@/lib/design-request-terms";

type DesignRequestTermsDialogProps = {
  onAccept: (acceptance: DesignTermsAcceptance) => void;
  onDecline: () => void;
  onClose?: () => void;
};

export function DesignRequestTermsDialog({ onAccept, onDecline, onClose }: DesignRequestTermsDialogProps) {
  return (
    <TermsDialog<DesignTermsAcceptance>
      terms={designRequestTerms}
      notice={{ title: "Full payment before viewing", body: designRequestTerms.paymentNotice, icon: LockKeyhole }}
      acceptUrl="/api/design-requests/terms"
      declineLabel="No, return to dashboard"
      helperText="Choose Yes to continue to the form. Choose No to leave without submitting a request."
      onAccept={onAccept}
      onDecline={onDecline}
      onClose={onClose}
      closeLabel="Back to request"
    />
  );
}
