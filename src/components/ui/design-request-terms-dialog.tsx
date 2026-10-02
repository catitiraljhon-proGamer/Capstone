"use client";

import { FileCheck2, LoaderCircle, LockKeyhole } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { designRequestTerms, type DesignTermsAcceptance } from "@/lib/design-request-terms";

type DesignRequestTermsDialogProps = {
  onAccept: (acceptance: DesignTermsAcceptance) => void;
  onDecline: () => void;
  onClose?: () => void;
};

export function DesignRequestTermsDialog({ onAccept, onDecline, onClose }: DesignRequestTermsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestPending = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    dialog?.showModal();
    headingRef.current?.focus();
    return () => {
      dialog?.close();
      root.style.overflow = previousOverflow;
    };
  }, []);

  async function accept() {
    if (requestPending.current) return;
    requestPending.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/design-requests/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true, version: designRequestTerms.version }),
      });
      const payload = await response.json() as { acceptance?: DesignTermsAcceptance; error?: string };
      if (!response.ok || !payload.acceptance) {
        throw new Error(payload.error ?? "Unable to record your agreement. Please try again.");
      }
      onAccept(payload.acceptance);
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Unable to record your agreement. Please try again.");
    } finally {
      requestPending.current = false;
      setIsSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={isSaving}
      onCancel={(event) => {
        event.preventDefault();
        if (!requestPending.current) (onClose ?? onDecline)();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/50 open:flex"
    >
      <header className="shrink-0 border-b border-stone-200 px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700">
          <FileCheck2 aria-hidden="true" className="h-4 w-4" /> G4 Builders Inc
        </p>
        <h2 ref={headingRef} tabIndex={-1} id={titleId} className="mt-2 text-xl font-semibold tracking-tight outline-none">
          {designRequestTerms.title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-stone-600">{designRequestTerms.introduction}</p>
      </header>

      <div tabIndex={0} aria-label="Terms and conditions details" className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-600 sm:px-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-900">
            <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0" /> Full payment before viewing
          </p>
          <p className="mt-2 text-sm leading-6 text-red-900">{designRequestTerms.paymentNotice}</p>
        </div>
        <ol className="mt-5 space-y-5">
          {designRequestTerms.sections.map((section, index) => (
            <li key={section.title}>
              <h3 className="text-sm font-semibold">{index + 1}. {section.title}</h3>
              <p className="mt-1 text-sm leading-6 text-stone-600">{section.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 border-t border-stone-200 pt-4 text-xs leading-5 text-stone-500">
          Terms version {designRequestTerms.version}. Your agreement is recorded with your customer profile identity, the terms version, and the date and time of acceptance.
        </p>
      </div>

      <footer className="shrink-0 border-t border-stone-200 bg-white px-5 py-4 sm:px-6">
        {onClose ? (
          <Button type="button" variant="outline" onClick={onClose} className="w-full">Back to request</Button>
        ) : (
          <>
            <p className="text-sm leading-6 text-stone-600">{designRequestTerms.acknowledgment}</p>
            {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="outline" disabled={isSaving} onClick={onDecline} className="h-11">No, return to dashboard</Button>
              <Button type="button" disabled={isSaving} onClick={() => void accept()} className="h-11">
                {isSaving ? <LoaderCircle aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isSaving ? "Recording agreement…" : "Yes, I have read and agree"}
              </Button>
            </div>
            <p className="mt-2 text-center text-xs leading-5 text-stone-500">Choose Yes to continue to the form. Choose No to leave without submitting a request.</p>
          </>
        )}
      </footer>
    </dialog>
  );
}
