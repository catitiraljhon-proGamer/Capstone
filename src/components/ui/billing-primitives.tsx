"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const billingFieldClass = "mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15 disabled:bg-stone-100";
export const billingDate = (value: string) => new Date(value.length === 10 ? value + "T00:00:00+08:00" : value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });

export function BillingPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</section>;
}

export function BillingBadge({ status }: { status: string }) {
  const tone = ["Overdue", "Rejected", "Reversed", "Void"].includes(status)
    ? "bg-red-50 text-red-800 ring-red-200"
    : ["Paid", "Verified"].includes(status) ? "bg-stone-900 text-white ring-stone-900"
    : ["Draft", "Ready"].includes(status) ? "bg-stone-100 text-stone-600 ring-stone-200"
    : "bg-rose-50 text-red-700 ring-rose-200";
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}>{status === "Sent" ? "Issued" : status}</span>;
}

export function BillingEmpty({ text = "No records match your filters." }: { text?: string }) {
  return <p className="rounded-lg border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">{text}</p>;
}

export function BillingDialog({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <Button variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose} disabled={busy}><X className="h-5 w-5" /></Button>
    </div>
    <div className="p-5">{children}</div>
  </dialog>;
}

export function BillingErrorMessage({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{message}</p> : null;
}

export async function billingJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string; issues?: { message: string }[] };
  if (!response.ok) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to complete the billing request.");
  return payload;
}
