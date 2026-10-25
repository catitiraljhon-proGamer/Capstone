"use client";

import { addressFieldErrors, PhAddressFields, readAddressDetails, type AddressFieldErrors } from "@/components/clients/ph-address-fields";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { embeddedImageAccept, readEmbeddedImage } from "@/lib/client-image-upload";
import { formatScheduleDateTime, toDateTimeInput } from "@/lib/schedule-display";
import { lotFacings, maxSitePhotos, siteInspectionResults, type LotFacing } from "@/lib/site-inspection";
import type { ApprovalDto } from "@/types/approvals";
import { CalendarClock, CheckCircle2, ImagePlus, LoaderCircle, MapPin, Ruler, Trash2, XCircle } from "lucide-react";
import Image from "next/image";
import { useState, type ChangeEvent, type FormEvent } from "react";

type Result = (typeof siteInspectionResults)[number];

const field = "mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600";
const label = "block text-sm font-medium text-stone-700";

const statusStyle: Record<string, string> = {
  "Not scheduled": "bg-stone-100 text-stone-700",
  Scheduled: "bg-amber-50 text-amber-800",
  Approved: "bg-emerald-50 text-emerald-700",
  "Not suitable": "bg-red-50 text-red-700",
};

async function send(designRequestId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/design-requests/${designRequestId}/site-inspection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; issues?: { message?: string }[] };
  if (!response.ok) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "The site inspection could not be saved.");
}

/** "Tomorrow at 9:00 AM", a sensible first choice for a site visit. */
function nextMorning() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeInput(date);
}

/**
 * Design requests: an architect or engineer inspects the lot in person before the request can be approved. The admin
 * books the visit here, then records what was found: measurements, which side faces the road, photos, and the result.
 */
export function AdminSiteInspection({ approval, onChanged }: { approval: ApprovalDto; onChanged: (message: string) => void }) {
  const inspection = approval.siteInspection;
  const status = inspection?.status ?? "Not scheduled";
  const open = approval.status === "Pending";

  return (
    <section aria-labelledby="site-inspection-heading" className="rounded-lg border border-stone-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="site-inspection-heading" className="text-xs font-semibold uppercase tracking-wide text-red-700">Site Inspection</h3>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyle[status]}`}>{status}</span>
      </div>
      <p className="mt-2 flex items-start gap-2 text-sm text-stone-700">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
        <span>{approval.lotAddress ?? "No lot address yet. This request was sent before the lot address was asked; enter it when you schedule the inspection."}</span>
      </p>
      {inspection ? (
        <p className="mt-1 flex items-start gap-2 text-sm text-stone-700">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
          <span>{formatScheduleDateTime(inspection.scheduledFor)} · {inspection.durationMinutes} min</span>
        </p>
      ) : null}

      {inspection && inspection.status !== "Scheduled" ? <InspectionSummary approval={approval} /> : null}

      {open && (!inspection || inspection.status === "Scheduled") ? (
        <div className="mt-4 space-y-4">
          {inspection ? <RecordForm approval={approval} onChanged={onChanged} /> : null}
          <ScheduleForm approval={approval} onChanged={onChanged} />
        </div>
      ) : null}
    </section>
  );
}

function InspectionSummary({ approval }: { approval: ApprovalDto }) {
  const inspection = approval.siteInspection!;
  const facts = [
    inspection.lotArea !== undefined ? `${inspection.lotArea.toLocaleString("en-PH")} sqm lot` : "",
    inspection.frontage !== undefined && inspection.depth !== undefined ? `${inspection.frontage} m frontage × ${inspection.depth} m depth` : "",
    inspection.facing ? `Faces ${inspection.facing}` : "",
  ].filter(Boolean);
  const approved = inspection.status === "Approved";
  return (
    <div className="mt-4 space-y-3">
      <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${approved ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
        {approved ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>
          {approved ? "Site approved" : "Site not suitable"}
          {inspection.recordedByName ? ` by ${inspection.recordedByName}` : ""}
          {inspection.recordedAt ? ` · ${formatScheduleDateTime(inspection.recordedAt)}` : ""}
        </span>
      </p>
      {facts.length ? (
        <p className="flex items-start gap-2 text-sm text-stone-700"><Ruler className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />{facts.join(" · ")}</p>
      ) : null}
      {inspection.notes ? <p className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-700">{inspection.notes}</p> : null}
      {inspection.reason ? <p className="whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-700">{inspection.reason}</p> : null}
      {inspection.photos.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {inspection.photos.map((photo, index) => (
            <div key={index} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
              <Image src={photo} alt={`Site photo ${index + 1}`} fill unoptimized className="object-cover" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ScheduleForm({ approval, onChanged }: { approval: ApprovalDto; onChanged: (message: string) => void }) {
  const moving = Boolean(approval.siteInspection);
  const needsAddress = !approval.lotAddressDetails;
  const [when, setWhen] = useState(() => approval.siteInspection ? toDateTimeInput(new Date(approval.siteInspection.scheduledFor)) : nextMorning());
  const [duration, setDuration] = useState(String(approval.siteInspection?.durationMinutes ?? 60));
  const [editAddress, setEditAddress] = useState(needsAddress);
  const [addressErrors, setAddressErrors] = useState<AddressFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const scheduledFor = new Date(when);
    if (Number.isNaN(scheduledFor.getTime())) return setError("Choose the inspection date and time.");
    let lotAddress: ReturnType<typeof readAddressDetails> | undefined;
    if (editAddress) {
      const data = new FormData(form);
      const errors = addressFieldErrors(Object.fromEntries([...data].map(([name, value]) => [name, String(value)])));
      setAddressErrors(errors);
      if (Object.values(errors).some(Boolean)) return setError("Complete the lot address.");
      lotAddress = readAddressDetails(data);
    }
    setBusy(true);
    setError(null);
    try {
      await send(approval.recordId, {
        action: "schedule", scheduledFor: scheduledFor.toISOString(), durationMinutes: Number(duration),
        ...(lotAddress ? { lotAddress } : {}),
      });
      onChanged(moving ? "The site inspection was moved and the customer was notified." : "The site inspection was scheduled and the customer was notified.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The site inspection could not be scheduled.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-lg bg-stone-50 p-3">
      <p className="text-sm font-semibold text-stone-950">{moving ? "Move the Inspection" : "Schedule the Inspection"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Date and Time <RequiredIndicator />
          <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} disabled={busy} className={field} />
        </label>
        <label className={label}>
          Length
          <select value={duration} onChange={(event) => setDuration(event.target.value)} disabled={busy} className={field}>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="90">1 hour 30 minutes</option>
            <option value="120">2 hours</option>
          </select>
        </label>
      </div>
      {editAddress ? (
        <PhAddressFields
          defaultValue={approval.lotAddressDetails ?? null}
          inputClassName={field}
          labelClassName={label}
          errors={addressErrors}
        />
      ) : (
        <button type="button" onClick={() => setEditAddress(true)} className="text-sm font-semibold text-red-700 underline-offset-4 hover:underline">
          Correct the lot address
        </button>
      )}
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant={moving ? "outline" : "default"} disabled={busy}>
          {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />}
          {busy ? "Saving…" : moving ? "Move Inspection" : "Schedule Inspection"}
        </Button>
      </div>
    </form>
  );
}

function RecordForm({ approval, onChanged }: { approval: ApprovalDto; onChanged: (message: string) => void }) {
  const [result, setResult] = useState<Result>("Approved");
  const [values, setValues] = useState({ lotArea: "", frontage: "", depth: "", facing: "" as LotFacing | "", notes: "", reason: "" });
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, maxSitePhotos - photos.length);
    event.target.value = "";
    try {
      const read = await Promise.all(files.map((file) => readEmbeddedImage(file)));
      setPhotos((current) => [...current, ...read].slice(0, maxSitePhotos));
      setError(null);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "The photo could not be read.");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const approved = result === "Approved";
    const next: Record<string, string> = {};
    const number = (key: "lotArea" | "frontage" | "depth", name: string) => {
      const text = values[key].trim();
      if (!text) { if (approved) next[key] = `Enter the ${name}.`; return undefined; }
      const parsed = Number(text);
      if (!Number.isFinite(parsed) || parsed <= 0) { next[key] = `The ${name} must be more than 0.`; return undefined; }
      return parsed;
    };
    const lotArea = number("lotArea", "lot area");
    const frontage = number("frontage", "frontage");
    const depth = number("depth", "depth");
    if (approved && !values.facing) next.facing = "Choose which side faces the road.";
    if (!approved && values.reason.trim().length < 5) next.reason = "Explain why the site is not suitable.";
    setErrors(next);
    if (Object.keys(next).length) return setError("Check the highlighted fields.");
    setBusy(true);
    setError(null);
    try {
      await send(approval.recordId, {
        action: "record", result, photos,
        ...(lotArea !== undefined ? { lotArea } : {}), ...(frontage !== undefined ? { frontage } : {}), ...(depth !== undefined ? { depth } : {}),
        ...(values.facing ? { facing: values.facing } : {}),
        ...(approved ? { notes: values.notes.trim() } : { reason: values.reason.trim() }),
      });
      onChanged(approved
        ? "The site was approved. You can approve the design request now."
        : "The site was recorded as not suitable, so the request was declined and the customer was told why.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The inspection result could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const describe = (key: string) => ({
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `site-${key}-error` : undefined,
  } as const);

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-lg border border-stone-200 p-3">
      <p className="text-sm font-semibold text-stone-950">Record the Inspection Result</p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Result</legend>
        {siteInspectionResults.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2.5 text-sm font-semibold has-[:checked]:border-red-700 has-[:checked]:bg-rose-50">
            <input type="radio" name="site-result" value={option} checked={result === option} onChange={() => setResult(option)} className="h-4 w-4 accent-red-700" />
            {option === "Approved" ? "Site approved" : "Site not suitable"}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="site-lotArea">Lot Area (sqm) {result === "Approved" ? <RequiredIndicator /> : null}</label>
          <input id="site-lotArea" type="number" inputMode="decimal" min="0.01" step="0.01" value={values.lotArea} onChange={(event) => set("lotArea", event.target.value)} placeholder="Enter lot area" disabled={busy} className={field} {...describe("lotArea")} />
          <FieldError id="site-lotArea-error" message={errors.lotArea} />
        </div>
        <div>
          <label className={label} htmlFor="site-facing">Side Facing the Road {result === "Approved" ? <RequiredIndicator /> : null}</label>
          <select id="site-facing" value={values.facing} onChange={(event) => set("facing", event.target.value)} disabled={busy} className={field} {...describe("facing")}>
            <option value="">Select a direction</option>
            {lotFacings.map((facing) => <option key={facing} value={facing}>{facing}</option>)}
          </select>
          <FieldError id="site-facing-error" message={errors.facing} />
        </div>
        <div>
          <label className={label} htmlFor="site-frontage">Frontage (m) {result === "Approved" ? <RequiredIndicator /> : null}</label>
          <input id="site-frontage" type="number" inputMode="decimal" min="0.01" step="0.01" value={values.frontage} onChange={(event) => set("frontage", event.target.value)} placeholder="Enter frontage" disabled={busy} className={field} {...describe("frontage")} />
          <FieldError id="site-frontage-error" message={errors.frontage} />
        </div>
        <div>
          <label className={label} htmlFor="site-depth">Depth (m) {result === "Approved" ? <RequiredIndicator /> : null}</label>
          <input id="site-depth" type="number" inputMode="decimal" min="0.01" step="0.01" value={values.depth} onChange={(event) => set("depth", event.target.value)} placeholder="Enter depth" disabled={busy} className={field} {...describe("depth")} />
          <FieldError id="site-depth-error" message={errors.depth} />
        </div>
      </div>
      {result === "Approved" ? (
        <label className={label}>
          Notes for the Design Team
          <span className="block text-xs font-normal text-stone-500">Orientation for sunlight and airflow, setbacks, or anything the design must follow.</span>
          <textarea rows={3} maxLength={1_000} value={values.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Enter notes" disabled={busy} className={`${field} resize-y`} />
        </label>
      ) : (
        <div>
          <label className={label} htmlFor="site-reason">Reason <RequiredIndicator /></label>
          <span className="block text-xs font-normal text-stone-500">The customer reads this, and the request is declined.</span>
          <textarea id="site-reason" rows={3} maxLength={1_000} value={values.reason} onChange={(event) => set("reason", event.target.value)} placeholder="Enter reason" disabled={busy} className={`${field} resize-y`} {...describe("reason")} />
          <FieldError id="site-reason-error" message={errors.reason} />
        </div>
      )}
      <div>
        <p className={label}>Site Photos <span className="font-normal text-stone-500">(optional, up to {maxSitePhotos})</span></p>
        {photos.length ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <li key={index} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                <Image src={photo} alt={`Site photo ${index + 1}`} fill unoptimized className="object-cover" />
                <button type="button" onClick={() => setPhotos((current) => current.filter((_, position) => position !== index))} disabled={busy} aria-label={`Remove site photo ${index + 1}`} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-white/90 text-stone-700 shadow hover:text-red-700">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {photos.length < maxSitePhotos ? (
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            Add Photos
            <input type="file" multiple accept={embeddedImageAccept} onChange={(event) => void addPhotos(event)} disabled={busy} className="sr-only" />
          </label>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
          {busy ? "Saving…" : "Save Result"}
        </Button>
      </div>
    </form>
  );
}
