"use client";

import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

type FormDialogProps = {
  title: string;
  description?: string;
  /** Shown above the form so a failed save is visible inside the pop-up. */
  error?: string | null;
  /** While saving, Escape and the close button do nothing. */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** A centered pop-up for short forms, such as adding a schedule. */
export function FormDialog({ title, description, error, busy = false, onClose, children }: FormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        // Only Escape on the dialog itself closes it, not a "cancel" bubbling from an input.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
    >
      <div className="sticky top-0 z-30 flex items-start justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description ? <p className="mt-1 text-sm text-stone-600">{description}</p> : null}
        </div>
        <Button variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose} disabled={busy}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="space-y-4 p-5">
        {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {children}
      </div>
    </dialog>
  );
}
