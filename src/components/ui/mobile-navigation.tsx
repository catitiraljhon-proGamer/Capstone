"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function MobileNavigation({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const desktop = window.matchMedia("(min-width: 1024px)");
    if (desktop.matches) {
      onOpenChange(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    const closeOnDesktop = () => {
      if (desktop.matches) onOpenChange(false);
    };
    desktop.addEventListener("change", closeOnDesktop);

    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Navigation menu"
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-stone-950/40 p-0 text-stone-950 backdrop:bg-transparent"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="relative flex h-full w-72 max-w-[calc(100vw-2rem)] flex-col border-r border-stone-200 bg-white shadow-xl">
        <button
          type="button"
          className="absolute right-3 top-6 grid h-11 w-11 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-red-700"
          aria-label="Close navigation menu"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </dialog>
  );
}
