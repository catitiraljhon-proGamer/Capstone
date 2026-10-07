"use client";

import { Copyright, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { TermsDialog } from "@/components/customer/terms-dialog";
import {
  finishedDesignsCopyrightNotice,
  finishedDesignsTerms,
} from "@/lib/finished-designs-terms";

type GateState = "checking" | "required" | "accepted" | "error";

async function fetchAcceptance() {
  const response = await fetch("/api/finished-designs/terms", { cache: "no-store" });
  const payload = (await response.json()) as { accepted?: boolean; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Unable to load the terms.");
  return Boolean(payload.accepted);
}

/**
 * Shows Finished Designs only after the customer agrees to the current
 * terms. The server enforces the same rule when sending design images.
 */
export function FinishedDesignsTermsGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAcceptance()
      .then((accepted) => {
        if (active) setState(accepted ? "accepted" : "required");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const notice = {
    title: "Protected designs",
    body: finishedDesignsTerms.notice,
    icon: ShieldAlert,
  };

  if (state === "checking") {
    return <p role="status" className="text-sm text-stone-500">Checking your agreement…</p>;
  }

  if (state === "error") {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Unable to load the Finished Designs terms. Refresh the page to try again.
      </p>
    );
  }

  if (state === "required") {
    return (
      <>
        <div className="rounded-xl border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-600">
          Agree to the Finished Designs Terms and Conditions to view the designs.
        </div>
        <TermsDialog
          terms={finishedDesignsTerms}
          notice={notice}
          acceptUrl="/api/finished-designs/terms"
          declineLabel="No, return to dashboard"
          helperText="Choose Yes to view the designs. Choose No to return without viewing them."
          onAccept={() => setState("accepted")}
          onDecline={() => router.push("/customer")}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm leading-6 text-red-900">
          <Copyright aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
          {finishedDesignsCopyrightNotice}
        </p>
        <button
          type="button"
          onClick={() => setIsReviewing(true)}
          className="min-h-11 shrink-0 rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-red-800 hover:bg-rose-100"
        >
          View terms
        </button>
      </div>
      {children}
      {isReviewing ? (
        <TermsDialog
          terms={finishedDesignsTerms}
          notice={notice}
          acceptUrl="/api/finished-designs/terms"
          declineLabel=""
          helperText=""
          onAccept={() => setIsReviewing(false)}
          onDecline={() => setIsReviewing(false)}
          onClose={() => setIsReviewing(false)}
        />
      ) : null}
    </div>
  );
}
