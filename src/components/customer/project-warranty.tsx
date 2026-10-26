"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, ImagePlus, LoaderCircle, Printer, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { billingJson } from "@/components/billing/billing-primitives";
import { Eyebrow } from "@/components/customer/construction-shared";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormDialog } from "@/components/ui/form-dialog";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { manilaDate } from "@/lib/billing";
import { embeddedImageAccept, readResizedPhoto } from "@/lib/client-image-upload";
import { formatScheduleDateTime } from "@/lib/schedule-display";
import {
  daysBetween,
  maxClaimPhotos,
  openWarrantyClaimStatuses,
  warrantyClaimStep,
  warrantyClaimSteps,
  warrantyDate,
  warrantyLimits,
  warrantyStatusClass,
  warrantyTerm,
} from "@/lib/warranty";
import type { ConstructionProjectDto } from "@/types/construction";
import type { ProjectWarrantyDto, WarrantyClaimDto, WarrantyClaimsResponse } from "@/types/warranty";

const field = "mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600";
const label = "block text-sm font-medium text-stone-700";

/** What happens next on a claim, in the customer's words. */
function claimDetail(claim: WarrantyClaimDto) {
  switch (claim.status) {
    case "Submitted": return "G4 Builders will set a date to inspect it at your house. You'll see the date in My Schedule.";
    case "Inspection scheduled": return `G4 Builders will inspect it at your house on ${formatScheduleDateTime(claim.inspection!.scheduledFor)}.`;
    case "Covered": return "It's covered by your warranty. G4 Builders will schedule the repair, free of charge.";
    case "Not covered": return `After the inspection, it isn't covered by the warranty. Reason: ${claim.result?.reason ?? "—"}.`;
    case "Repair scheduled": return `G4 Builders will repair it at your house on ${formatScheduleDateTime(claim.repair!.scheduledFor)}, free of charge.`;
    case "Repaired": return `Repaired ${claim.repair?.repairedAt ? warrantyDate(manilaDate(new Date(claim.repair.repairedAt))) : ""}. Confirm it's fixed, or the report closes by itself on ${claim.closesOn ? warrantyDate(claim.closesOn) : "its closing date"}.`;
    case "Closed": return `Closed ${claim.closedAt ? warrantyDate(manilaDate(new Date(claim.closedAt))) : ""}${claim.closedBy === "customer" ? " after you confirmed the repair" : ""}.`;
  }
}

function StatusBadge({ claim }: { claim: WarrantyClaimDto }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${warrantyStatusClass[claim.status]}`}>{claim.status}</span>;
}

/** The five steps of a report, filled up to the one it is on. */
export function WarrantyClaimProgress({ claim }: { claim: WarrantyClaimDto }) {
  const current = warrantyClaimStep(claim.status);
  return (
    <ol aria-label="Report progress" className="grid grid-cols-5 gap-2">
      {warrantyClaimSteps.map((step, index) => (
        <li key={step} aria-current={index === current ? "step" : undefined} className="min-w-0">
          <div className={`h-1.5 rounded-full ${index <= current ? "bg-red-700" : "bg-rose-200"}`} />
          <p className={`mt-1.5 break-words text-xs leading-4 ${index === current ? "font-semibold text-stone-950" : "text-stone-600"}`}>{step}</p>
        </li>
      ))}
    </ol>
  );
}

function OpenClaim({ claim, onChanged }: { claim: WarrantyClaimDto; onChanged: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await billingJson(await fetch(`/api/warranty-claims/${claim.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm-repair" }),
      }));
      onChanged(`Thank you. ${claim.reference} is closed.`);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "The repair could not be confirmed.");
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-red-200 bg-rose-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>{`Open Report · ${claim.reference}`}</Eyebrow>
          <p className="mt-1 break-words font-semibold text-stone-950">{claim.problemType} · {claim.location}</p>
          <p className="mt-1 text-sm leading-6 text-stone-700">{claimDetail(claim)}</p>
        </div>
        <StatusBadge claim={claim} />
      </div>
      <div className="mt-4"><WarrantyClaimProgress claim={claim} /></div>
      {claim.status === "Repaired" ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {error ? <p role="alert" className="mr-auto text-sm text-red-700">{error}</p> : null}
          <Button className="min-h-11" onClick={() => void confirm()} disabled={busy}>
            {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
            {busy ? "Saving…" : "Confirm It's Fixed"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The warranty of a completed house: how long it has left, the open reports with their progress, every past report,
 * and Report a Problem while the warranty runs.
 */
export function ProjectWarranty({ project }: { project: ConstructionProjectDto & { warranty: ProjectWarrantyDto } }) {
  const { warranty } = project;
  const [data, setData] = useState<WarrantyClaimsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const load = useCallback((signal?: AbortSignal) =>
    fetch("/api/warranty-claims", { cache: "no-store", signal })
      .then((response) => billingJson<WarrantyClaimsResponse>(response))
      .then((payload) => { if (!signal?.aborted) { setData(payload); setError(null); } })
      .catch((loadError: unknown) => {
        if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : "Your warranty reports could not be loaded.");
      }), []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const claims = (data?.claims ?? []).filter((claim) => claim.project.id === project.id);
  const open = claims.filter((claim) => openWarrantyClaimStatuses.includes(claim.status));
  const covers = (data?.problemTypes ?? []).filter((type) => type !== "Other");
  const totalDays = Math.max(1, daysBetween(warranty.startsOn, warranty.endsOn));
  const elapsed = Math.min(100, Math.max(0, ((totalDays - warranty.daysLeft) / totalDays) * 100));
  const left = !warranty.active ? "Ended" : warranty.daysLeft === 0 ? "Last day today" : warranty.daysLeft === 1 ? "1 day left" : `${warranty.daysLeft.toLocaleString("en-PH")} days left`;
  const changed = (message: string) => { setNotice(message); void load(); };

  return (
    <section id={`warranty-${project.id}`} aria-labelledby={`warranty-heading-${project.id}`} className="min-w-0 scroll-mt-28 space-y-5 rounded-xl border-2 border-rose-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-red-700"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div>
          <div className="min-w-0">
            <Eyebrow>Warranty</Eyebrow>
            <h2 id={`warranty-heading-${project.id}`} className="mt-1 text-xl font-semibold tracking-tight">
              {warranty.active ? "Your house is under warranty" : "Your warranty has ended"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Counted from the day your project was completed, {warrantyDate(warranty.startsOn)}. Covered repairs are free.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={`/customer/warranty-certificate/${project.id}`}><Printer className="mr-2 h-4 w-4" aria-hidden="true" />View Certificate</Link>
          </Button>
          {warranty.active ? (
            <Button className="min-h-11" onClick={() => { setNotice(null); setReporting(true); }} disabled={!data}>
              <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />Report a Problem
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold capitalize">{warrantyTerm(warranty.months)} Warranty</h3>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${warranty.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-700"}`}>
            {warranty.active ? "Active" : "Ended"}
          </span>
        </div>
        {covers.length ? <p className="mt-1.5 text-sm leading-6 text-stone-600">Covers {covers.join(", ").toLowerCase()}.</p> : null}
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-rose-200" role="progressbar" aria-label="Warranty used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed)}>
          <div className="h-full rounded-full bg-red-700" style={{ width: `${elapsed}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-stone-600">
          <span>{warrantyDate(warranty.startsOn)} – {warrantyDate(warranty.endsOn)}</span>
          <span className="font-semibold text-stone-950">{left}</span>
        </div>
      </div>

      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}

      {open.map((claim) => <OpenClaim key={claim.id} claim={claim} onChanged={changed} />)}

      {claims.length ? (
        <div>
          <h3 className="text-base font-semibold tracking-tight">Your Reports</h3>
          <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Problems reported for {project.name}</caption>
              <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr><th className="px-3 py-2.5">Reference</th><th className="px-3 py-2.5">Problem</th><th className="px-3 py-2.5">Location</th><th className="px-3 py-2.5">Reported</th><th className="px-3 py-2.5">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {claims.map((claim) => (
                  <tr key={claim.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{claim.reference}</td>
                    <td className="px-3 py-3">{claim.problemType}</td>
                    <td className="px-3 py-3">{claim.location}</td>
                    <td className="whitespace-nowrap px-3 py-3">{warrantyDate(manilaDate(new Date(claim.reportedAt)))}</td>
                    <td className="px-3 py-3">
                      <StatusBadge claim={claim} />
                      {claim.status === "Not covered" || claim.status === "Closed" ? <p className="mt-1.5 max-w-xs text-xs leading-5 text-stone-600">{claimDetail(claim)}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : data && warranty.active ? (
        <p className="rounded-lg bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
          If something in your house needs fixing, such as a leak or a crack, use Report a Problem. G4 Builders will inspect it at your house.
        </p>
      ) : null}

      {reporting && data ? (
        <ReportProblemDialog
          project={project}
          problemTypes={data.problemTypes}
          onClose={() => setReporting(false)}
          onSubmitted={(claim) => { setReporting(false); changed(`Report ${claim.reference} sent. G4 Builders will set a date to inspect it at your house.`); }}
        />
      ) : null}
    </section>
  );
}

type Draft = { problemType: string; noticedOn: string; location: string; description: string };

function ReportProblemDialog({ project, problemTypes, onClose, onSubmitted }: {
  project: ConstructionProjectDto & { warranty: ProjectWarrantyDto };
  problemTypes: string[];
  onClose: () => void;
  onSubmitted: (claim: WarrantyClaimDto) => void;
}) {
  const today = manilaDate();
  const [values, setValues] = useState<Draft>({ problemType: "", noticedOn: today, location: "", description: "" });
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft | "photos", string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof Draft, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };
  const describe = (key: keyof Draft | "photos") => ({
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `report-${key}-error` : undefined,
  } as const);

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, maxClaimPhotos - photos.length);
    event.target.value = "";
    try {
      const read = await Promise.all(files.map((file) => readResizedPhoto(file)));
      setPhotos((current) => [...current, ...read].slice(0, maxClaimPhotos));
      setErrors((current) => ({ ...current, photos: "" }));
    } catch (readError) {
      setErrors((current) => ({ ...current, photos: readError instanceof Error ? readError.message : "The photo could not be read." }));
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!values.problemType) next.problemType = "Choose the problem type.";
    if (!values.noticedOn) next.noticedOn = "Choose the date you noticed the problem.";
    else if (values.noticedOn > today) next.noticedOn = "The date can't be in the future.";
    else if (values.noticedOn < project.warranty.startsOn) next.noticedOn = `Choose a date from ${warrantyDate(project.warranty.startsOn)}, when your house was completed.`;
    if (values.location.trim().length < 2) next.location = "Enter the location in the house.";
    if (values.description.trim().length < 10) next.description = "Describe the problem in a sentence or two.";
    if (!photos.length) next.photos = "Add at least one photo of the problem.";
    setErrors(next);
    if (Object.values(next).some(Boolean)) return setError("Check the highlighted fields.");
    setBusy(true);
    setError(null);
    try {
      const { claim } = await billingJson<{ claim: WarrantyClaimDto }>(await fetch("/api/warranty-claims", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id, problemType: values.problemType, noticedOn: values.noticedOn,
          location: values.location.trim(), description: values.description.trim(), photos,
        }),
      }));
      onSubmitted(claim);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your report could not be sent.");
      setBusy(false);
    }
  };

  return (
    <FormDialog title="Report a Problem" description={`${project.name} · ${project.reference}`} error={error} busy={busy} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="report-problemType" className={label}>Problem Type <RequiredIndicator /></label>
            <select id="report-problemType" value={values.problemType} onChange={(event) => set("problemType", event.target.value)} disabled={busy} className={`${field} h-11`} {...describe("problemType")}>
              <option value="">Select problem type</option>
              {problemTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <FieldError id="report-problemType-error" message={errors.problemType} />
          </div>
          <div>
            <label htmlFor="report-noticedOn" className={label}>Date Noticed <RequiredIndicator /></label>
            <input id="report-noticedOn" type="date" value={values.noticedOn} min={project.warranty.startsOn} max={today} onChange={(event) => set("noticedOn", event.target.value)} disabled={busy} className={`${field} h-11`} {...describe("noticedOn")} />
            <FieldError id="report-noticedOn-error" message={errors.noticedOn} />
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Covered by your {warrantyTerm(project.warranty.months)} warranty, which runs until {warrantyDate(project.warranty.endsOn)}.
        </p>
        <div>
          <label htmlFor="report-location" className={label}>Location in the House <RequiredIndicator /></label>
          <input id="report-location" value={values.location} maxLength={warrantyLimits.location} onChange={(event) => set("location", event.target.value)} placeholder="Enter location in the house" disabled={busy} className={`${field} h-11`} {...describe("location")} />
          <FieldError id="report-location-error" message={errors.location} />
        </div>
        <div>
          <label htmlFor="report-description" className={label}>Description <RequiredIndicator /></label>
          <textarea id="report-description" rows={4} value={values.description} maxLength={warrantyLimits.description} onChange={(event) => set("description", event.target.value)} placeholder="Enter description" disabled={busy} className={`${field} resize-y`} {...describe("description")} />
          <p className="mt-1 text-xs text-stone-500">Say what you see and when it happens, for example only when it rains.</p>
          <FieldError id="report-description-error" message={errors.description} />
        </div>
        <div>
          <p className={label}>Photos <RequiredIndicator /></p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((photo, index) => (
              <div key={index} className="relative aspect-square overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                <Image src={photo} alt={`Problem photo ${index + 1}`} fill unoptimized className="object-cover" />
                <button type="button" onClick={() => setPhotos((current) => current.filter((_, position) => position !== index))} disabled={busy} aria-label={`Remove photo ${index + 1}`} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-md bg-white/90 text-stone-700 shadow hover:text-red-700">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            {photos.length < maxClaimPhotos ? (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-stone-200 bg-stone-50 text-sm font-semibold text-stone-600 hover:border-red-200 hover:bg-rose-50">
                <ImagePlus className="h-6 w-6" aria-hidden="true" />
                Add Photos
                <input type="file" multiple accept={embeddedImageAccept} onChange={(event) => void addPhotos(event)} disabled={busy} className="sr-only" {...describe("photos")} />
              </label>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-stone-500">At least 1 and up to {maxClaimPhotos} photos, JPG, PNG, or WebP.</p>
          <FieldError id="report-photos-error" message={errors.photos} />
        </div>
        <p className="rounded-lg bg-stone-50 px-3 py-2.5 text-sm leading-6 text-stone-700">
          After you submit, G4 Builders will set a date to inspect the problem at your house. You&apos;ll see the date in My Schedule.
        </p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" className="min-h-11" disabled={busy}>
            {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Sending…" : "Submit Report"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
