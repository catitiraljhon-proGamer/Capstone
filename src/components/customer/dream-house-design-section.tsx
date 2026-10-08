"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Download, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingDialog, billingDate } from "@/components/billing/billing-primitives";
import { Eyebrow } from "@/components/customer/construction-shared";
import { formatPeso } from "@/lib/house-design-data";
import type { DesignRequestDto } from "@/types/design-requests";

/** The design part of a Dream House card: request details, design fee, and viewing once unlocked. */
export function DreamHouseDesignSection({ design }: { design: DesignRequestDto }) {
  const [viewing, setViewing] = useState(false);
  return (
    <section aria-label="Design" className="space-y-4 p-5">
      <Eyebrow>Design</Eyebrow>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
        <span>Requested {billingDate(design.createdAt)}</span>
        {design.status === "Completed" && <span>{design.imageCount} design image{design.imageCount === 1 ? "" : "s"} delivered {design.completedAt ? billingDate(design.completedAt) : ""}</span>}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-stone-50 px-3 py-2"><dt className="text-xs text-stone-500">Preferred Date</dt><dd className="mt-1 font-semibold text-stone-950">{design.preferredDate ? billingDate(design.preferredDate) : "Not specified"}</dd></div>
        <div className="rounded-lg bg-stone-50 px-3 py-2"><dt className="text-xs text-stone-500">Needed By</dt><dd className="mt-1 font-semibold text-stone-950">{design.neededBy ? billingDate(design.neededBy) : "Not specified"}</dd></div>
      </dl>
      {design.notes && <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">{design.notes}</p>}
      {design.access === "in-progress" && <p className="rounded-lg bg-stone-50 p-4 text-sm leading-6 text-stone-600">{design.status === "Rejected" ? "Review your request or contact the admin before submitting a new one." : "Your design will appear after admin approval and completion. No design fee is due here yet."}</p>}
      {design.access === "awaiting-invoice" && <div className="rounded-lg bg-rose-50 p-4"><p className="text-sm font-semibold text-red-900">Design ready · Awaiting fee invoice</p><p className="mt-2 text-sm leading-6 text-stone-600">Your images are secured. The Billing Clerk will prepare the agreed design fee in Billing Status.</p></div>}
      {design.invoice && <div className="rounded-lg border border-stone-200 p-4">
        <p className="text-xs font-semibold text-stone-500">Design fee · {design.invoice.number}</p>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">{[["Amount", design.invoice.amount], ["Verified paid", design.invoice.paid], ["Balance", design.invoice.balance]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-stone-500">{label}</dt><dd className="mt-1 break-words font-semibold">{formatPeso(Number(value))}</dd></div>)}</dl>
      </div>}
      {design.access === "payment-required" && <div><p className="mb-3 text-sm leading-6 text-stone-600">{design.invoice?.pending ? "Payment submitted — awaiting Billing Clerk verification. The design stays locked until the full fee is verified." : "Settle the remaining design fee to unlock your images. Partial payments do not unlock the design."}</p><Button asChild><Link href={"/customer/billing?invoice=" + design.invoice?.id}>Pay / review design fee</Link></Button></div>}
      {design.access === "unlocked" && <div><p className="mb-3 text-sm text-stone-600">Full payment verified. Your design is ready to view and download.</p><Button onClick={() => setViewing(true)}><FileImage className="mr-2 h-4 w-4" />View My Design</Button></div>}
      {viewing && design.access === "unlocked" && <BillingDialog title={"Your house design · " + design.id.slice(-8).toUpperCase()} onClose={() => setViewing(false)}>
        <p className="mb-5 text-sm text-stone-600">{design.floorArea} sqm · {design.rooms} · {design.finish}</p>
        <div className="space-y-6">{Array.from({ length: design.imageCount }, (_, index) => {
          const src = "/api/design-requests/" + design.id + "/images/" + index;
          return <div key={index} className="overflow-hidden rounded-lg border border-stone-200"><div className="relative aspect-[4/3] bg-stone-50"><Image src={src} alt={"Your completed house design, image " + (index + 1)} fill unoptimized className="object-contain" /></div><a href={src + "?download=1"} className="inline-flex items-center gap-2 p-4 text-sm font-semibold text-red-700 hover:underline"><Download className="h-4 w-4" />Download image {index + 1}</a></div>;
        })}</div>
      </BillingDialog>}
    </section>
  );
}
