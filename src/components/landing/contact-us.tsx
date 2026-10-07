"use client";

import { ExternalLink, Mail, MapPin, Phone, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const address = "Dr. Bahia St. ICV Poblacion 3, Balayan, Philippines, 4213";
const mapsUrl = `https://www.bing.com/maps/default.aspx?where1=${encodeURIComponent(address)}`;

export function ContactDetails() {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-base font-semibold text-stone-950">G4 Builders Incorporated</p>
      <a
        href="tel:+63434073561"
        className="flex min-h-14 items-center gap-3 rounded-lg border border-stone-200 p-3 text-stone-950 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700"
      >
        <Phone aria-hidden="true" className="h-5 w-5 shrink-0 text-red-700" />
        <span><span className="block text-xs text-stone-500">Call us</span><span className="mt-1 block font-semibold">(043) 407 3561</span></span>
      </a>
      <a
        href="mailto:g4builders2014@gmail.com"
        className="flex min-h-14 items-center gap-3 rounded-lg border border-stone-200 p-3 text-stone-950 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700"
      >
        <Mail aria-hidden="true" className="h-5 w-5 shrink-0 text-red-700" />
        <span className="min-w-0"><span className="block text-xs text-stone-500">Email us</span><span className="mt-1 block break-all font-semibold">g4builders2014@gmail.com</span></span>
      </a>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-14 items-start gap-3 rounded-lg border border-stone-200 p-3 text-stone-950 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-700"
      >
        <MapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-red-700" />
        <span className="min-w-0">
          <span className="block text-xs text-stone-500">Visit us for walk-in inquiries</span>
          <span className="mt-1 block leading-6">{address}</span>
          <span className="mt-2 inline-flex items-center gap-1.5 font-semibold text-red-700">Open in Maps<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /><span className="sr-only"> (opens in a new tab)</span></span>
        </span>
      </a>
    </div>
  );
}

export function ContactUs() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="h-24 shrink-0 print:hidden">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        <Phone aria-hidden="true" className="h-5 w-5" />
        Contact Us
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>("button, a[href]");
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
        onCancel={(event) => { event.preventDefault(); setOpen(false); }}
        onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-4 text-stone-950 backdrop:bg-stone-950/50 open:flex open:items-center open:justify-center"
      >
        <section className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-stone-200 bg-white p-4 shadow-xl sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-semibold tracking-tight">Contact Us</h2>
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-stone-600">Call, email, or visit our office for project and billing inquiries.</p>
            </div>
            <button
              type="button"
              aria-label="Close Contact Us"
              onClick={() => setOpen(false)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-red-700"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <ContactDetails />
        </section>
      </dialog>
    </div>
  );
}
