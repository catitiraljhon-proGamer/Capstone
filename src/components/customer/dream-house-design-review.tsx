"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileText, LockKeyhole, MessageSquareText, Send } from "lucide-react";
import { BillingErrorMessage, billingDate, billingJson } from "@/components/billing/billing-primitives";
import { constructionFieldClass, Eyebrow } from "@/components/customer/construction-shared";
import { HouseDesignGallery } from "@/components/house-designs/house-design-gallery";
import { BlueprintPickup } from "@/components/customer/blueprint-pickup";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/house-design-data";
import type { DesignRequestDto, DesignVersionDto } from "@/types/design-requests";

const versionImages = (designId: string, version: DesignVersionDto) =>
  Array.from({ length: version.imageCount }, (_, index) => `/api/design-requests/${designId}/versions/${version.version}/images/${index}`);

const fileSize = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1_000))} KB`);

/** Admin notes and customer answers for every design round, newest first. */
function VersionHistory({ versions }: { versions: DesignVersionDto[] }) {
  if (versions.length < 2 && !versions[0]?.response && !versions[0]?.adminNote) return null;
  return (
    <details className="rounded-lg border border-stone-200 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-stone-950">Review history ({versions.length} version{versions.length === 1 ? "" : "s"})</summary>
      <ol className="mt-4 space-y-4">
        {[...versions].reverse().map((version) => (
          <li key={version.version} className="space-y-2 border-l-2 border-rose-200 pl-4 text-sm">
            <p className="font-semibold text-stone-950">Version {version.version} · {billingDate(version.createdAt)}</p>
            {version.adminNote && <p className="whitespace-pre-wrap break-words leading-6 text-stone-600"><span className="font-medium text-stone-800">G4 Builders:</span> {version.adminNote}</p>}
            {version.response && (
              <p className="whitespace-pre-wrap break-words leading-6 text-stone-600">
                <span className="font-medium text-stone-800">You {version.response.decision === "approved" ? "approved this version" : "requested changes"}</span>
                {version.response.note ? `: ${version.response.note}` : "."}
              </p>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

function ReviewActions({ design, onChanged }: { design: DesignRequestDto; onChanged: (message?: string) => void }) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteError = mode === "changes" && note.trim().length > 0 && note.trim().length < 5 ? "Describe the changes in at least 5 characters." : null;

  const respond = async (decision: "approved" | "changes") => {
    if (decision === "changes" && note.trim().length < 5) { setError("Describe the changes you want (at least 5 characters)."); return; }
    setBusy(true);
    setError(null);
    try {
      await billingJson(await fetch(`/api/design-requests/${design.id}/response`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: decision === "changes" ? note.trim() : "" }),
      }));
      onChanged(decision === "approved"
        ? "Design approved. G4 Builders will now prepare your blueprint."
        : "Your requested changes were sent. The admin will upload a revised design for your review.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to send your response.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-rose-50/60 p-4">
      <p className="text-sm font-semibold text-stone-950">Is this design and floor plan what you want?</p>
      <p className="text-sm leading-6 text-stone-600">Approve it so G4 Builders can prepare your blueprint, or tell the admin what to change. Reviews are free.</p>
      <BillingErrorMessage message={error} />
      {mode === "changes" ? (
        <div>
          <label className="block text-sm font-medium text-stone-700" htmlFor={`changes-${design.id}`}>Changes You Want</label>
          <textarea
            id={`changes-${design.id}`} rows={4} maxLength={1_000} value={note} disabled={busy}
            onChange={(event) => { setNote(event.target.value); setError(null); }}
            aria-invalid={noteError ? true : undefined}
            placeholder="Example: Move the kitchen to the back and add a window in the master bedroom."
            className={`${constructionFieldClass} resize-y aria-invalid:border-red-600`}
          />
          {noteError && <p className="mt-1.5 text-sm text-red-700">{noteError}</p>}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" disabled={busy} onClick={() => { setMode("idle"); setNote(""); setError(null); }}>Cancel</Button>
            <Button disabled={busy} onClick={() => void respond("changes")}><Send className="mr-2 h-4 w-4" />{busy ? "Sending…" : "Send Changes"}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={busy} onClick={() => void respond("approved")}><CheckCircle2 className="mr-2 h-4 w-4" />{busy ? "Saving…" : "Approve Design"}</Button>
          <Button variant="outline" disabled={busy} onClick={() => setMode("changes")}><MessageSquareText className="mr-2 h-4 w-4" />Request Changes</Button>
        </div>
      )}
    </div>
  );
}

/** Blueprint fee, then the blueprint online and a printed copy at the office, once the design is approved. */
function BlueprintSection({ design, onChanged }: { design: DesignRequestDto; onChanged: (message?: string) => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 p-4">
      <div className="flex items-center gap-2">
        {design.access === "unlocked" ? <FileText className="h-5 w-5 text-red-700" /> : <LockKeyhole className="h-5 w-5 text-stone-500" />}
        <p className="text-sm font-semibold text-stone-950">Blueprint</p>
      </div>
      {design.access === "awaiting-invoice" && (
        <p className="text-sm leading-6 text-stone-600">
          G4 Builders is preparing your blueprint. Its fee invoice will appear in Billing Status once it is ready.
        </p>
      )}
      {design.invoice && (
        <dl className="grid grid-cols-3 gap-3 text-sm">
          {([["Blueprint fee", design.invoice.amount], ["Verified paid", design.invoice.paid], ["Balance", design.invoice.balance]] as const).map(([label, value]) => (
            <div key={label} className="min-w-0"><dt className="text-xs text-stone-500">{label}</dt><dd className="mt-1 break-words font-semibold">{formatPeso(value)}</dd></div>
          ))}
        </dl>
      )}
      {design.access === "payment-required" && (
        <div>
          <p className="mb-3 text-sm leading-6 text-stone-600">
            {design.invoice?.pending
              ? "Payment submitted — awaiting Billing Clerk verification. The blueprint unlocks once the full fee is verified."
              : "Pay the blueprint fee to unlock your blueprint. Partial payments do not unlock it."}
          </p>
          <Button asChild><Link href={`/customer/billing?invoice=${design.invoice?.id}`}>Pay / Review Blueprint Fee</Link></Button>
        </div>
      )}
      {design.access === "unlocked" && (
        <div>
          <p className="mb-3 text-sm text-stone-600">Full payment verified. Download your blueprint files here, or pick up a printed copy at our office.</p>
          <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200">
            {design.blueprintFiles.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span className="min-w-0 break-words text-sm font-medium text-stone-950">{file.name} <span className="font-normal text-stone-500">· {fileSize(file.size)}</span></span>
                <a href={`/api/design-requests/${design.id}/blueprint/${file.id}?download=1`} className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:underline">
                  <Download className="h-4 w-4" />Download
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4"><BlueprintPickup design={design} onChanged={onChanged} /></div>
        </div>
      )}
    </div>
  );
}

/** Blueprint workflow: free design and floor plan review, then the paid blueprint. */
export function DreamHouseDesignReview({ design, onChanged }: {
  design: DesignRequestDto;
  onChanged: (message?: string) => void;
}) {
  const latest = design.versions.at(-1);
  return (
    <section aria-label="Design" className="space-y-4 p-5">
      <Eyebrow>Design and Floor Plan</Eyebrow>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
        <span>Requested {billingDate(design.createdAt)}</span>
        {latest && <span>Version {latest.version} shared {billingDate(latest.createdAt)}</span>}
      </div>
      {design.notes && <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">{design.notes}</p>}
      {!latest && (
        <p className="rounded-lg bg-stone-50 p-4 text-sm leading-6 text-stone-600">
          {design.status === "Rejected"
            ? "Review your request or contact the admin before submitting a new one."
            : design.status === "Approved"
              ? "Your request is feasible. The admin is preparing your design and floor plan. You will review them here for free."
              : "Your design and floor plan will appear here after the admin approves your request. Nothing is charged at this stage."}
        </p>
      )}
      {latest && (
        <>
          <HouseDesignGallery images={versionImages(design.id, latest)} name={`Design version ${latest.version}`} protectedView fit="contain" />
          <p className="text-xs text-stone-500">Preview only. The watermark is removed in the paid blueprint.</p>
          {latest.adminNote && <p className="whitespace-pre-wrap break-words rounded-lg bg-stone-50 p-4 text-sm leading-6 text-stone-700"><span className="font-semibold">Note from G4 Builders:</span> {latest.adminNote}</p>}
        </>
      )}
      {design.status === "In customer review" && <ReviewActions design={design} onChanged={onChanged} />}
      {design.status === "Changes requested" && (
        <p className="rounded-lg bg-rose-50 p-4 text-sm leading-6 text-red-900">Your requested changes were sent. The admin will share a revised version here.</p>
      )}
      {design.status === "Design approved" && (
        <>
          <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-4 text-sm leading-6 text-red-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            You approved this design{design.designApprovedAt ? ` on ${billingDate(design.designApprovedAt)}` : ""}.
          </p>
          <BlueprintSection design={design} onChanged={onChanged} />
        </>
      )}
      <VersionHistory versions={design.versions} />
    </section>
  );
}
