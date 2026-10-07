"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Download, FileImage, LockKeyhole, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingDialog, BillingErrorMessage, billingDate, billingJson } from "@/components/billing/billing-primitives";
import { formatPeso } from "@/lib/house-design-data";
import type { DesignRequestDto } from "@/types/design-requests";

const statusText: Record<DesignRequestDto["status"], string> = {
  Pending: "Waiting for admin review", "In review": "Under feasibility review",
  Approved: "Approved · Design in progress", Rejected: "Request declined", Completed: "Design delivered",
};

export function CustomerRequestedDesigns() {
  const [requests, setRequests] = useState<DesignRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback((signal?: AbortSignal) =>
    fetch("/api/design-requests", { cache: "no-store", signal })
      .then((response) => billingJson<{ requests: DesignRequestDto[] }>(response))
      .then((data) => { if (!signal?.aborted) { setRequests(data.requests); setError(null); } })
      .catch((error: unknown) => { if (!signal?.aborted) { setRequests([]); setError(error instanceof Error ? error.message : "Unable to load your designs."); } })
      .finally(() => { if (!signal?.aborted) setLoading(false); }), []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const onFocus = () => { void load(controller.signal); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); window.removeEventListener("focus", onFocus); };
  }, [load]);
  const selected = requests.find((request) => request.id === selectedId && request.access === "unlocked");

  return <div className="space-y-6">
    <section className="rounded-xl bg-gradient-to-r from-red-950 to-red-800 p-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-rose-200">Designed for you</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your requested house designs</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-rose-100">Follow your request from admin approval to delivery. Once your design is ready, settle the design fee. Viewing and downloading unlock when the Billing Clerk verifies full payment.</p>
      <ol className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-white">
        {["Submit request", "Admin approval & design", "Pay design fee", "View your design"].map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
      </ol>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-stone-600">Only designs requested by you appear here.</p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={loading} onClick={() => { setLoading(true); void load(); }}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        <Button asChild><Link href="/customer/design-requests">New Design Request</Link></Button>
      </div>
    </div>
    <BillingErrorMessage message={error} />
    {loading && <p role="status" className="text-sm text-stone-500">Loading your designs…</p>}
    {!loading && !error && !requests.length && <section className="rounded-xl border border-dashed border-stone-200 bg-white p-10 text-center">
      <FileImage className="mx-auto h-10 w-10 text-stone-400" /><h2 className="mt-4 text-lg font-semibold">No requested designs yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600">Send your requirements and inspiration images in Design Requests. Your request will appear here for tracking.</p>
      <Link href="/customer/finished-designs" className="mt-4 inline-block text-sm font-semibold text-red-700 hover:underline">Explore finished designs for inspiration</Link>
    </section>}
    <div className="grid items-start gap-5 lg:grid-cols-2">
      {requests.map((design) => <article key={design.id} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex min-h-36 items-center gap-4 border-b border-stone-200 bg-stone-50 p-6">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-stone-200">
            {design.access === "unlocked" ? <CheckCircle2 className="h-7 w-7 text-red-700" /> : design.status === "Completed" ? <LockKeyhole className="h-7 w-7 text-stone-500" /> : <FileImage className="h-7 w-7 text-stone-400" />}
          </div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-red-700">Request {design.id.slice(-8).toUpperCase()}</p><h2 className="mt-2 text-xl font-semibold tracking-tight">{design.selectedDesign?.name ?? `${design.floorArea} sqm · ${design.finish}`}</h2>{design.selectedDesign && <p className="mt-1 text-sm text-stone-600">{design.floorArea} sqm · {design.finish}</p>}<p className="mt-1 text-sm text-stone-600">{design.rooms}</p></div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-red-800">{statusText[design.status]}</span><span className="text-xs text-stone-500">Requested {billingDate(design.createdAt)}</span></div>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{design.notes}</p>
          {design.status === "Completed" && <p className="text-xs text-stone-500">{design.imageCount} design image{design.imageCount === 1 ? "" : "s"} delivered {design.completedAt ? billingDate(design.completedAt) : ""}</p>}
          {design.access === "in-progress" && <p className="rounded-lg bg-stone-50 p-4 text-sm leading-6 text-stone-600">{design.status === "Rejected" ? "Review your request or contact the admin before submitting a new one." : "Your design will appear after admin approval and completion. No design fee is due here yet."}</p>}
          {design.access === "awaiting-invoice" && <div className="rounded-lg bg-rose-50 p-4"><p className="text-sm font-semibold text-red-900">Design ready · Awaiting fee invoice</p><p className="mt-2 text-sm leading-6 text-stone-600">Your images are secured. The Billing Clerk will prepare the agreed design fee in Billing Status.</p></div>}
          {design.invoice && <div className="rounded-lg border border-stone-200 p-4">
            <p className="text-xs font-semibold text-stone-500">Design fee · {design.invoice.number}</p>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">{[["Amount", design.invoice.amount], ["Verified paid", design.invoice.paid], ["Balance", design.invoice.balance]].map(([label, value]) => <div key={label}><dt className="text-xs text-stone-500">{label}</dt><dd className="mt-1 font-semibold">{formatPeso(Number(value))}</dd></div>)}</dl>
          </div>}
          {design.access === "payment-required" && <div><p className="mb-3 text-sm leading-6 text-stone-600">{design.invoice?.pending ? "Payment submitted — awaiting Billing Clerk verification. The design stays locked until the full fee is verified." : "Settle the remaining design fee to unlock your images. Partial payments do not unlock the design."}</p><Button asChild><Link href={"/customer/billing?invoice=" + design.invoice?.id}>Pay / review design fee</Link></Button></div>}
          {design.access === "unlocked" && <div><p className="mb-3 text-sm text-stone-600">Full payment verified. Your design is ready to view and download.</p><Button onClick={() => setSelectedId(design.id)}><FileImage className="mr-2 h-4 w-4" />View My Design</Button></div>}
        </div>
      </article>)}
    </div>
    {selected && <BillingDialog title={"Your house design · " + selected.id.slice(-8).toUpperCase()} onClose={() => setSelectedId(null)}>
      <p className="mb-5 text-sm text-stone-600">{selected.floorArea} sqm · {selected.rooms} · {selected.finish}</p>
      <div className="space-y-6">{Array.from({ length: selected.imageCount }, (_, index) => {
        const src = "/api/design-requests/" + selected.id + "/images/" + index;
        return <div key={index} className="overflow-hidden rounded-lg border border-stone-200"><div className="relative aspect-[4/3] bg-stone-50"><Image src={src} alt={"Your completed house design, image " + (index + 1)} fill unoptimized className="object-contain" /></div><a href={src + "?download=1"} className="inline-flex items-center gap-2 p-4 text-sm font-semibold text-red-700 hover:underline"><Download className="h-4 w-4" />Download image {index + 1}</a></div>;
      })}</div>
    </BillingDialog>}
  </div>;
}
