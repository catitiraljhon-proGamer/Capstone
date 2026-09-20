"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function LogoutConfirmation({
  isPending,
  error,
  onCancel,
  onConfirm,
}: {
  isPending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Lock the root separately from the mobile menu's body scroll lock.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    dialog.showModal();
    cancelRef.current?.focus();

    return () => {
      dialog.close();
      root.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={isPending}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isPending) onCancel();
      }}
      onClick={(event) => {
        if (!isPending && event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-4 text-stone-950 backdrop:bg-stone-950/50 open:flex open:items-center open:justify-center"
    >
      <section className="max-h-full w-full max-w-sm overflow-y-auto rounded-xl border border-stone-200 bg-white p-5 shadow-xl sm:p-6">
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-700">
          <LogOut aria-hidden="true" className="h-5 w-5" />
        </span>
        <h2 id={titleId} className="text-xl font-semibold tracking-tight">Log out?</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-stone-600">
          Are you sure you want to log out of your account?
        </p>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="min-h-11 rounded-lg border border-stone-200 px-3 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-3 py-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
          >
            {isPending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> : null}
            {isPending ? "Logging out…" : "Yes, log out"}
          </button>
        </div>
      </section>
    </dialog>
  );
}

export function LogoutButton({ onLogout }: { onLogout?: () => void }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestPending = useRef(false);

  const logout = async () => {
    if (requestPending.current) return;
    requestPending.current = true;
    setIsPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to log out. Please try again.");
      setIsOpen(false);
      onLogout?.();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to log out. Please check your connection and try again.");
      requestPending.current = false;
      setIsPending(false);
    }
  };

  return (
    <>
    <button
      type="button"
      onClick={() => { setError(null); setIsOpen(true); }}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      disabled={isPending}
      className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-sm font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 disabled:opacity-60"
    >
      <LogOut aria-hidden="true" className="h-5 w-5" />
      {isPending ? "Logging out…" : "Log out"}
    </button>
    {isOpen ? createPortal(
      <LogoutConfirmation
        isPending={isPending}
        error={error}
        onCancel={() => { if (!requestPending.current) setIsOpen(false); }}
        onConfirm={() => void logout()}
      />,
      document.body,
    ) : null}
    </>
  );
}
