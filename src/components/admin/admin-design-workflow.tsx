"use client";

import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Clock, FileText, FileUp, ImagePlus, LoaderCircle, MessageSquareText, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { embeddedImageAccept, readEmbeddedImage } from "@/lib/client-image-upload";
import { formatPeso } from "@/lib/house-design-data";
import type { DesignVersionDto, DesignWorkflowDto } from "@/types/design-requests";

const maxVersionImages = 6;
/** Keeps one upload under the hosting platform's request body limit. */
const maxVersionBytes = 3_200_000;
const maxBlueprintBytes = 3_000_000;
const blueprintAccept = "application/pdf,image/jpeg,image/png,image/webp";

type SelectedImage = { src: string; name: string; size: number };

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string; issues?: { message?: string }[] };
  if (!response.ok) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "The request could not be completed.");
  return payload;
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

const formatDate = (value: string) => new Date(value).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fileSize = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1_000))} KB`);

function VersionCard({ designId, version }: { designId: string; version: DesignVersionDto }) {
  return (
    <li className="rounded-lg border border-stone-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Version {version.version}</p>
        <p className="text-xs text-stone-500">{formatDate(version.createdAt)}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: version.imageCount }, (_, index) => (
          <div key={index} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-stone-100">
            <Image src={`/api/design-requests/${designId}/versions/${version.version}/images/${index}`} alt={`Version ${version.version}, image ${index + 1}`} fill unoptimized className="object-contain" />
          </div>
        ))}
      </div>
      {version.adminNote && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700"><span className="font-semibold">Your note:</span> {version.adminNote}</p>}
      {version.response ? (
        <p className={`mt-3 whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-6 ${version.response.decision === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          <span className="font-semibold">{version.response.decision === "approved" ? "Customer approved" : "Customer requested changes"}</span>
          {version.response.note ? `: ${version.response.note}` : "."}
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-stone-500"><Clock className="h-4 w-4" />Waiting for the customer&apos;s response</p>
      )}
    </li>
  );
}

function VersionUpload({ designId, revision, onUploaded }: { designId: string; revision: boolean; onUploaded: (message: string) => void }) {
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalBytes = images.reduce((sum, image) => sum + image.size, 0);

  const addImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const room = maxVersionImages - images.length;
    if (!files.length) return;
    if (room <= 0) { setError(`You can send up to ${maxVersionImages} images per version.`); return; }
    setError(null);
    try {
      const selected = await Promise.all(files.slice(0, room).map(async (file) => ({ src: await readEmbeddedImage(file), name: file.name, size: file.size })));
      setImages((current) => [...current, ...selected]);
      if (files.length > room) setError(`Only ${room} more image(s) were added. The limit is ${maxVersionImages}.`);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Unable to read the image.");
    }
  };

  const send = async () => {
    if (!images.length) { setError("Add at least one design or floor plan image."); return; }
    if (totalBytes > maxVersionBytes) { setError("The images are too large together. Keep the total under 3 MB, or send fewer images."); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await readJson<{ request: { version: number } }>(await fetch(`/api/design-requests/${designId}/versions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: images.map((image) => image.src), note: note.trim() }),
      }));
      setImages([]);
      setNote("");
      onUploaded(`Version ${result.request.version} was sent to the customer for review.`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send the design.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{revision ? "Revision" : "Design production"}</p>
      <h3 className="mt-1 font-semibold">{revision ? "Upload the revised design and floor plan" : "Upload the design and floor plan"}</h3>
      <p className="mt-1 text-sm leading-6 text-stone-600">
        The customer sees these right away as a watermarked preview and can approve them or request changes. Nothing is billed at this stage.
      </p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image, index) => (
          <div key={`${image.name}-${index}`} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <div className="relative aspect-[4/3]">
              <Image src={image.src} alt={`Design image ready to send ${index + 1}`} fill unoptimized className="object-contain" />
              <button type="button" disabled={busy} onClick={() => setImages((current) => current.filter((_, position) => position !== index))}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-stone-950/75 text-white hover:bg-red-700" aria-label={`Remove ${image.name}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="truncate border-t border-stone-200 px-3 py-2 text-xs text-stone-500">{image.name}</p>
          </div>
        ))}
        {images.length < maxVersionImages && (
          <label className="grid min-h-32 cursor-pointer place-items-center rounded-lg border border-dashed border-rose-300 bg-white p-4 text-center hover:bg-rose-50">
            <span>
              <ImagePlus className="mx-auto h-7 w-7 text-red-700" />
              <span className="mt-2 block text-sm font-semibold">{images.length ? "Add more images" : "Select design and floor plan images"}</span>
              <span className="mt-1 block text-xs text-stone-500">Up to 6 · JPG, PNG, or WebP · 750 KB each, 3 MB total</span>
            </span>
            <input type="file" multiple accept={embeddedImageAccept} disabled={busy} onChange={(event) => void addImages(event)} className="sr-only" />
          </label>
        )}
      </div>
      <label className="mt-4 block text-sm font-semibold text-stone-700">
        Note to the customer <span className="font-normal text-stone-500">(optional)</span>
        <textarea rows={3} maxLength={1_000} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)}
          placeholder={revision ? "Explain what changed in this version." : "Describe the design and floor plan."}
          className="mt-2 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15" />
      </label>
      <div className="mt-3 flex justify-end">
        <Button type="button" disabled={busy || !images.length} onClick={() => void send()}>
          {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {busy ? "Sending…" : "Send to customer for review"}
        </Button>
      </div>
    </div>
  );
}

function BlueprintFiles({ workflow, onChanged }: { workflow: DesignWorkflowDto; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = workflow.blueprintPaid;

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!blueprintAccept.split(",").includes(file.type)) { setError("Upload a PDF, JPG, PNG, or WebP blueprint file."); return; }
    if (file.size > maxBlueprintBytes) { setError("Each blueprint file must be 3 MB or smaller. Split or compress the PDF and try again."); return; }
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/design-requests/${workflow.id}/blueprint`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, dataUrl: await readDataUrl(file) }),
      }));
      onChanged(`${file.name} was added to the blueprint.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the blueprint file.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (fileId: string, name: string) => {
    setBusy(true);
    setError(null);
    try {
      await readJson(await fetch(`/api/design-requests/${workflow.id}/blueprint/${fileId}`, { method: "DELETE" }));
      onChanged(`${name} was removed from the blueprint.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove the file.");
    } finally {
      setBusy(false);
    }
  };

  const estimateText = !workflow.estimate ? "The customer has not requested a cost estimate yet."
    : workflow.estimate.status === "Accepted" ? `Estimate ${workflow.estimate.reference} accepted.`
      : `Estimate ${workflow.estimate.reference} is ${workflow.estimate.status.toLowerCase()}.`;

  return (
    <div className="rounded-xl border border-stone-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Blueprint</p>
      <h3 className="mt-1 font-semibold">Blueprint files</h3>
      <p className="mt-1 text-sm leading-6 text-stone-600">
        {estimateText} The Billing Clerk can bill the blueprint fee once the estimate is accepted and at least one file is uploaded. The customer downloads these only after full payment is verified.
      </p>
      {workflow.blueprintInvoice && (
        <p className="mt-2 text-sm text-stone-700">
          Invoice {workflow.blueprintInvoice.number} · {formatPeso(workflow.blueprintInvoice.amount)} · {workflow.blueprintPaid ? "Paid" : `Balance ${formatPeso(workflow.blueprintInvoice.balance)}`}
        </p>
      )}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {workflow.blueprintFiles.length > 0 ? (
        <ul className="mt-3 divide-y divide-stone-200 rounded-lg border border-stone-200">
          {workflow.blueprintFiles.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <a href={`/api/design-requests/${workflow.id}/blueprint/${file.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-950 hover:text-red-700">
                <FileText className="h-4 w-4 shrink-0 text-red-700" /><span className="break-all">{file.name}</span><span className="shrink-0 text-xs font-normal text-stone-500">{fileSize(file.size)}</span>
              </a>
              {!locked && (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void remove(file.id, file.name)} aria-label={`Remove ${file.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-stone-200 p-4 text-sm text-stone-500">No blueprint files uploaded yet.</p>
      )}
      {locked ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />Paid — the customer can download the blueprint. Files are locked.</p>
      ) : (
        <label className={`mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-4 text-sm font-semibold hover:bg-stone-100 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {busy ? "Uploading…" : "Add blueprint file"}
          <input type="file" accept={blueprintAccept} disabled={busy} onChange={(event) => void upload(event)} className="sr-only" />
        </label>
      )}
      {!locked && <p className="mt-2 text-xs text-stone-500">PDF, JPG, PNG, or WebP · one file at a time · 3 MB each · up to 10 files</p>}
    </div>
  );
}

/** Admin side of the blueprint workflow for one approved design request. */
export function AdminDesignWorkflow({ designRequestId, onNotice }: { designRequestId: string; onNotice: (message: string) => void }) {
  const [workflow, setWorkflow] = useState<DesignWorkflowDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await readJson<{ workflow: DesignWorkflowDto }>(await fetch(`/api/design-requests/${designRequestId}/workflow`, { cache: "no-store" }));
      setWorkflow(payload.workflow);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load the design work.");
    }
  }, [designRequestId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/design-requests/${designRequestId}/workflow`, { cache: "no-store" })
      .then((response) => readJson<{ workflow: DesignWorkflowDto }>(response))
      .then((payload) => { if (active) setWorkflow(payload.workflow); })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load the design work."); });
    return () => { active = false; };
  }, [designRequestId]);

  const changed = (message: string) => { onNotice(message); void load(); };

  if (error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!workflow) return <p className="flex items-center gap-2 text-sm text-stone-500"><LoaderCircle className="h-4 w-4 animate-spin text-red-700" />Loading design work…</p>;

  const latest = workflow.versions.at(-1);
  return (
    <div className="space-y-4">
      {workflow.status === "In customer review" && (
        <p className="flex items-center gap-2 rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-700"><Clock className="h-4 w-4" />Version {latest?.version} is with the customer for review.</p>
      )}
      {workflow.status === "Changes requested" && latest?.response && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-semibold">Customer requested changes:</span> {latest.response.note}</span>
        </p>
      )}
      {(workflow.status === "Approved" || workflow.status === "Changes requested") && (
        <VersionUpload designId={workflow.id} revision={workflow.status === "Changes requested"} onUploaded={changed} />
      )}
      {workflow.status === "Design approved" && <BlueprintFiles workflow={workflow} onChanged={changed} />}
      {workflow.versions.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Review history</p>
          <ol className="mt-2 space-y-3">{[...workflow.versions].reverse().map((version) => <VersionCard key={version.version} designId={workflow.id} version={version} />)}</ol>
        </div>
      )}
    </div>
  );
}
