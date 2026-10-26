"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, CalendarClock, Check, CheckCircle2, ImagePlus, LoaderCircle, MapPin, Printer, Search, Trash2, Wrench, XCircle } from "lucide-react";
import { billingJson } from "@/components/billing/billing-primitives";
import { Button } from "@/components/ui/button";
import { clickableRowClass, clickableRowProps } from "@/components/ui/clickable-row";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { manilaDate } from "@/lib/billing";
import { embeddedImageAccept, readResizedPhoto } from "@/lib/client-image-upload";
import { formatScheduleDateTime, toDateTimeInput } from "@/lib/schedule-display";
import {
  maxInspectionPhotos,
  openWarrantyClaimStatuses,
  warrantyDate,
  warrantyLimits,
  warrantyStatusClass,
  type WarrantyClaimStatus,
  type WarrantyListsView,
} from "@/lib/warranty";
import type { WarrantyClaimAction, WarrantyClaimDto, WarrantyClaimsResponse } from "@/types/warranty";

const field = "mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600";
const label = "block text-sm font-medium text-stone-700";
const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const head = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";
const dayOf = (iso: string) => warrantyDate(manilaDate(new Date(iso)));

const filters: { label: string; statuses: WarrantyClaimStatus[] | null }[] = [
  { label: "All", statuses: null },
  { label: "Submitted", statuses: ["Submitted"] },
  { label: "Inspection", statuses: ["Inspection scheduled"] },
  { label: "Repair", statuses: ["Covered", "Repair scheduled", "Repaired"] },
  { label: "Closed", statuses: ["Closed", "Not covered"] },
];

function StatusBadge({ status }: { status: WarrantyClaimStatus }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${warrantyStatusClass[status]}`}>{status}</span>;
}

/** The Admin's next step on a claim, or what it is waiting for. */
function nextStep(claim: WarrantyClaimDto) {
  switch (claim.status) {
    case "Submitted": return { text: "Schedule inspection", action: true };
    case "Inspection scheduled": return { text: formatScheduleDateTime(claim.inspection!.scheduledFor), action: false };
    case "Covered": return { text: "Schedule repair", action: true };
    case "Repair scheduled": return { text: formatScheduleDateTime(claim.repair!.scheduledFor), action: false };
    case "Repaired": return { text: claim.closesOn ? `Closes ${warrantyDate(claim.closesOn)}` : "Waiting for the customer", action: false };
    case "Not covered": return { text: claim.result?.reason ?? "", action: false };
    case "Closed": return { text: claim.closedAt ? `Closed ${dayOf(claim.closedAt)}` : "", action: false };
  }
}

async function sendAction(id: string, body: WarrantyClaimAction) {
  return (await billingJson<{ claim: WarrantyClaimDto }>(await fetch(`/api/warranty-claims/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }))).claim;
}

/** Projects > Warranty Claims: every problem customers reported, filtered by step, and one claim at a time to act on. */
export function AdminWarrantyClaims({ data, error, selectedId, onSelect, onChanged }: {
  data: WarrantyClaimsResponse | null;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => void;
}) {
  if (selectedId) return <ClaimDetail id={selectedId} onBack={() => onSelect(null)} onChanged={onChanged} />;
  return <ClaimList data={data} error={error} onSelect={onSelect} />;
}

function ClaimList({ data, error, onSelect }: { data: WarrantyClaimsResponse | null; error: string | null; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(filters[0].label);
  const claims = useMemo(() => {
    const words = search.trim().toLowerCase();
    const statuses = filters.find((item) => item.label === filter)?.statuses ?? null;
    return (data?.claims ?? []).filter((claim) =>
      (!statuses || statuses.includes(claim.status))
      && (!words || [claim.reference, claim.customer.name, claim.project.reference, claim.project.name, claim.problemType, claim.location]
        .some((value) => value.toLowerCase().includes(words))));
  }, [data, filter, search]);

  return (
    <section className={`${panel} p-0`}>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
          <label htmlFor="warranty-search" className="sr-only">Search claims</label>
          <input id="warranty-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search claims" className={`${field} mt-0 h-11 pl-9`} />
        </div>
        <div role="group" aria-label="Filter by step" className="flex flex-wrap gap-1.5">
          {filters.map((item) => (
            <button
              key={item.label} type="button" aria-pressed={filter === item.label} onClick={() => setFilter(item.label)}
              className={`min-h-9 rounded-lg border px-3 text-sm font-semibold transition ${filter === item.label ? "border-red-700 bg-red-50 text-red-800" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p role="alert" className="mx-5 mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {!data && !error ? <p role="status" className="px-5 pb-5 text-sm text-stone-500">Loading warranty claims…</p> : null}
      {data && !claims.length ? (
        <p className="mx-5 mb-5 rounded-lg border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500">
          {data.claims.length ? "No claims match the search or filter." : "No warranty claims yet. Customers report problems from Dream House once their project is completed."}
        </p>
      ) : null}
      {claims.length ? (
        <div className="overflow-x-auto border-t border-stone-200">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <caption className="sr-only">Warranty claims</caption>
            <thead className="bg-stone-50">
              <tr>
                <th className={head}>Reference</th><th className={head}>Customer and Project</th><th className={head}>Problem</th>
                <th className={head}>Warranty Until</th><th className={head}>Reported</th><th className={head}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {claims.map((claim) => {
                const step = nextStep(claim);
                return (
                  <tr key={claim.id} className={`align-top ${clickableRowClass}`} {...clickableRowProps(`Open ${claim.reference}`, () => onSelect(claim.id))}>
                    <td className="whitespace-nowrap px-3 py-3.5 font-semibold">{claim.reference}</td>
                    <td className="px-3 py-3.5"><p className="font-semibold">{claim.customer.name}</p><p className="mt-0.5 text-stone-600">{claim.project.reference} · {claim.project.name}</p></td>
                    <td className="px-3 py-3.5"><p>{claim.problemType}</p><p className="mt-0.5 text-stone-600">{claim.location}</p></td>
                    <td className="whitespace-nowrap px-3 py-3.5">{warrantyDate(claim.warrantyEndsOn)}</td>
                    <td className="whitespace-nowrap px-3 py-3.5">{dayOf(claim.reportedAt)}</td>
                    <td className="px-3 py-3.5">
                      <StatusBadge status={claim.status} />
                      {step.text ? <p className={`mt-1.5 max-w-[14rem] text-xs leading-5 ${step.action ? "font-semibold text-red-700" : "text-stone-600"}`}>{step.text}</p> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-5 py-3.5 text-sm text-stone-600">
          <span>Showing {claims.length} of {data.claims.length} claim{data.claims.length === 1 ? "" : "s"}</span>
          <span>Warranty: {data.warrantyMonths} months from completion · <Link href="/admin/maintenance?section=warranty" className="font-semibold text-red-700 hover:underline">Change in Maintenance</Link></span>
        </div>
      ) : null}
    </section>
  );
}

function Photos({ photos, alt }: { photos: string[]; alt: string }) {
  if (!photos.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {photos.map((photo, index) => (
        <div key={index} className="relative aspect-square overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
          <Image src={photo} alt={`${alt} ${index + 1}`} fill unoptimized className="object-cover" />
        </div>
      ))}
    </div>
  );
}

function Fact({ term, value, note }: { term: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-stone-500">{term}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
      {note ? <dd className="mt-0.5 text-xs text-stone-600">{note}</dd> : null}
    </div>
  );
}

function ClaimDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [claim, setClaim] = useState<WarrantyClaimDto | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/warranty-claims/${id}`, { cache: "no-store", signal: controller.signal }).then((response) => billingJson<{ claim: WarrantyClaimDto }>(response)),
      fetch("/api/maintenance/warranty", { cache: "no-store", signal: controller.signal }).then((response) => billingJson<WarrantyListsView>(response)),
    ])
      .then(([loaded, lists]) => { setClaim(loaded.claim); setReasons(lists.notCoveredReasons); })
      .catch((loadError: unknown) => { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "The claim could not be loaded."); });
    return () => controller.abort();
  }, [id]);

  const updated = (next: WarrantyClaimDto, message: string) => {
    setClaim(next);
    setNotice(message);
    onChanged();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-w-0 space-y-5">
      <button type="button" onClick={onBack} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-red-700 hover:text-red-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Warranty Claims
      </button>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {!claim && !error ? <p role="status" className="text-sm text-stone-500">Loading the claim…</p> : null}
      {claim ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Warranty Claim {claim.reference}</p>
              <h2 className="mt-1 break-words text-2xl font-semibold tracking-tight">{claim.problemType} · {claim.location}</h2>
              <p className="mt-1 text-sm text-stone-600">{claim.customer.name} · {claim.project.reference} {claim.project.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={claim.status} />
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/warranty-certificate/${claim.project.id}`}><Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />Certificate</Link>
              </Button>
            </div>
          </div>
          {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
            <div className="min-w-0 space-y-5">
              <section className={panel}>
                <h3 className="text-base font-semibold tracking-tight">Customer&apos;s Report</h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-4">
                  <Fact term="Problem Type" value={claim.problemType} />
                  <Fact term="Date Noticed" value={warrantyDate(claim.noticedOn)} />
                  <Fact term="Reported" value={dayOf(claim.reportedAt)} />
                  <Fact term="Warranty" value={claim.warrantyEndsOn >= manilaDate() ? "Active" : "Ended"} note={`Until ${warrantyDate(claim.warrantyEndsOn)}`} />
                </dl>
                <p className="mt-4 text-xs text-stone-500">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-800">{claim.description}</p>
                <div className="mt-4"><Photos photos={claim.photos ?? []} alt="Customer photo" /></div>
              </section>

              {claim.result ? <ResultSummary claim={claim} /> : null}
              {claim.repair?.repairedAt ? (
                <section className={panel}>
                  <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight"><Wrench className="h-4 w-4 text-red-700" aria-hidden="true" />Repair</h3>
                  <p className="mt-2 text-sm text-stone-700">Marked repaired by {claim.repair.repairedByName} on {dayOf(claim.repair.repairedAt)}.</p>
                  {claim.repair.notes ? <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-700">{claim.repair.notes}</p> : null}
                </section>
              ) : null}

              {claim.status === "Inspection scheduled" ? <InspectionResultForm claim={claim} reasons={reasons} onSaved={updated} /> : null}
              {claim.status === "Repair scheduled" ? <MarkRepairedForm claim={claim} onSaved={updated} /> : null}
              {claim.status === "Submitted" || claim.status === "Inspection scheduled" ? <VisitForm claim={claim} kind="inspection" onSaved={updated} /> : null}
              {claim.status === "Covered" || claim.status === "Repair scheduled" ? <VisitForm claim={claim} kind="repair" onSaved={updated} /> : null}
              {claim.status === "Repaired" ? (
                <p className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-700">
                  Waiting for {claim.customer.name} to confirm the repair. The claim closes by itself on {claim.closesOn ? warrantyDate(claim.closesOn) : "its closing date"} otherwise.
                </p>
              ) : null}
            </div>

            <div className="min-w-0 space-y-5">
              <ClaimProgress claim={claim} />
              <Visits claim={claim} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ResultSummary({ claim }: { claim: WarrantyClaimDto }) {
  const result = claim.result!;
  return (
    <section className={panel}>
      <h3 className="text-base font-semibold tracking-tight">Inspection Result</h3>
      <p className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${result.covered ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-800"}`}>
        {result.covered ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>{result.covered ? "Covered — G4 Builders repairs it for free." : `Not covered: ${result.reason}`}</span>
      </p>
      <p className="mt-3 text-sm text-stone-600">Inspected by {result.inspectedBy} on {warrantyDate(result.inspectedOn)} · recorded by {result.recordedByName}</p>
      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-700">{result.findings}</p>
      {result.photos?.length ? <div className="mt-3"><Photos photos={result.photos} alt="Inspection photo" /></div> : null}
    </section>
  );
}

function ClaimProgress({ claim }: { claim: WarrantyClaimDto }) {
  const steps: { label: string; done: boolean; current: boolean; note?: string }[] = [
    { label: "Submitted", done: true, current: false, note: `${formatScheduleDateTime(claim.reportedAt)} by ${claim.customer.name}` },
    {
      label: "Inspection", done: Boolean(claim.result), current: claim.status === "Submitted" || claim.status === "Inspection scheduled",
      note: claim.result ? `Done ${warrantyDate(claim.result.inspectedOn)}` : claim.inspection ? `Scheduled ${formatScheduleDateTime(claim.inspection.scheduledFor)}` : "Not scheduled yet",
    },
    { label: claim.result ? (claim.result.covered ? "Covered" : "Not covered") : "Covered or not covered", done: Boolean(claim.result), current: false },
    {
      label: "Repair scheduled", done: Boolean(claim.repair), current: claim.status === "Covered",
      note: claim.repair ? formatScheduleDateTime(claim.repair.scheduledFor) : claim.status === "Not covered" ? "No repair needed" : undefined,
    },
    { label: "Repaired", done: Boolean(claim.repair?.repairedAt), current: claim.status === "Repair scheduled", note: claim.repair?.repairedAt ? dayOf(claim.repair.repairedAt) : undefined },
    {
      label: "Closed", done: claim.status === "Closed" || claim.status === "Not covered", current: claim.status === "Repaired",
      note: claim.closedAt ? `${dayOf(claim.closedAt)}${claim.closedBy === "customer" ? " · confirmed by the customer" : " · closed automatically"}` : claim.status === "Not covered" ? undefined : "When the customer confirms, or by itself after the set days",
    },
  ];
  return (
    <section className={panel}>
      <h3 className="text-base font-semibold tracking-tight">Progress</h3>
      <ol className="mt-4 space-y-4">
        {steps.map((step, index) => (
          <li key={step.label} aria-current={step.current ? "step" : undefined} className="flex gap-3">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${step.done ? "bg-red-700 text-white" : step.current ? "bg-red-700 text-white ring-4 ring-rose-200" : "bg-stone-100 text-stone-600"}`}>
              {step.done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-sm ${step.done || step.current ? "font-semibold text-stone-950" : "text-stone-600"}`}>{step.label}</p>
              {step.note ? <p className="mt-0.5 text-xs leading-5 text-stone-600">{step.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Visits({ claim }: { claim: WarrantyClaimDto }) {
  const visits = [
    claim.inspection ? { title: "Inspection Visit", ...claim.inspection } : null,
    claim.repair ? { title: "Repair Visit", ...claim.repair } : null,
  ].filter((visit) => visit !== null);
  if (!visits.length) return null;
  return (
    <section className={panel}>
      <h3 className="text-base font-semibold tracking-tight">Visits</h3>
      <ul className="mt-3 space-y-3">
        {visits.map((visit) => (
          <li key={visit.title} className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700"><CalendarClock className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{visit.title}</p>
              <p className="mt-0.5 text-stone-700">{formatScheduleDateTime(visit.scheduledFor)} · {visit.durationMinutes} min</p>
              <p className="mt-0.5 flex items-start gap-1 text-stone-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{visit.location}</p>
            </div>
          </li>
        ))}
      </ul>
      <Link href="/admin/scheduling" className="mt-3 inline-flex text-sm font-semibold text-red-700 hover:underline">View in Scheduling</Link>
    </section>
  );
}

/** "Tomorrow at 9:00 AM", a sensible first choice for a visit. */
function nextMorning() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeInput(date);
}

function VisitForm({ claim, kind, onSaved }: { claim: WarrantyClaimDto; kind: "inspection" | "repair"; onSaved: (claim: WarrantyClaimDto, message: string) => void }) {
  const existing = claim[kind];
  const [when, setWhen] = useState(() => existing ? toDateTimeInput(new Date(existing.scheduledFor)) : nextMorning());
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noun = kind === "inspection" ? "Inspection" : "Repair";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const scheduledFor = new Date(when);
    if (Number.isNaN(scheduledFor.getTime())) return setError(`Choose the ${kind} date and time.`);
    setBusy(true);
    setError(null);
    try {
      const saved = await sendAction(claim.id, {
        action: kind === "inspection" ? "schedule-inspection" : "schedule-repair",
        scheduledFor: scheduledFor.toISOString(), durationMinutes: Number(duration),
      });
      onSaved(saved, `The ${kind} was ${existing ? "moved" : "scheduled"} and ${claim.customer.name} was notified.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `The ${kind} could not be scheduled.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={`${panel} space-y-3 ${existing ? "" : "border-2 border-rose-200"}`}>
      <div>
        <h3 className="text-base font-semibold tracking-tight">{existing ? `Move the ${noun}` : `Schedule the ${noun}`}</h3>
        <p className="mt-1 text-sm text-stone-600">
          {kind === "inspection" ? "An in-person visit to the house to see the problem." : "The visit to fix the covered problem, free of charge."} It is added to Scheduling as a client meeting.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Date and Time <RequiredIndicator />
          <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} disabled={busy} className={`${field} h-11`} />
        </label>
        <label className={label}>
          Length
          <select value={duration} onChange={(event) => setDuration(event.target.value)} disabled={busy} className={`${field} h-11`}>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="120">2 hours</option>
            <option value="240">4 hours</option>
            <option value="480">8 hours</option>
          </select>
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant={existing ? "outline" : "default"} disabled={busy} className="min-h-11">
          {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarClock className="mr-2 h-4 w-4" aria-hidden="true" />}
          {busy ? "Saving…" : existing ? `Move ${noun}` : `Schedule ${noun}`}
        </Button>
      </div>
    </form>
  );
}

function InspectionResultForm({ claim, reasons, onSaved }: { claim: WarrantyClaimDto; reasons: string[]; onSaved: (claim: WarrantyClaimDto, message: string) => void }) {
  const today = manilaDate();
  const [values, setValues] = useState({ inspectedOn: today, inspectedBy: "", findings: "", reason: "" });
  const [covered, setCovered] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };
  const describe = (key: string) => ({
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `inspection-${key}-error` : undefined,
  } as const);

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, maxInspectionPhotos - photos.length);
    event.target.value = "";
    try {
      const read = await Promise.all(files.map((file) => readResizedPhoto(file)));
      setPhotos((current) => [...current, ...read].slice(0, maxInspectionPhotos));
      setError(null);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "The photo could not be read.");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!values.inspectedOn) next.inspectedOn = "Choose the date of the inspection.";
    else if (values.inspectedOn > today) next.inspectedOn = "The inspection date can't be in the future.";
    if (values.inspectedBy.trim().length < 2) next.inspectedBy = "Enter who inspected the problem.";
    if (values.findings.trim().length < 10) next.findings = "Describe what the inspection found.";
    if (covered === null) next.covered = "Choose whether the problem is covered.";
    if (covered === false && !values.reason) next.reason = "Choose why the problem is not covered.";
    setErrors(next);
    if (Object.keys(next).length) return setError("Check the highlighted fields.");
    setBusy(true);
    setError(null);
    try {
      const base = { action: "record-inspection" as const, inspectedOn: values.inspectedOn, inspectedBy: values.inspectedBy.trim(), findings: values.findings.trim(), photos };
      const saved = await sendAction(claim.id, covered ? { ...base, covered: true } : { ...base, covered: false, reason: values.reason });
      onSaved(saved, covered
        ? `${claim.reference} is covered and ${claim.customer.name} was notified. Schedule the repair next.`
        : `${claim.reference} was recorded as not covered and ${claim.customer.name} was told why.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The inspection result could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={`${panel} space-y-4 border-2 border-rose-200`}>
      <div>
        <h3 className="text-base font-semibold tracking-tight">Inspection Result</h3>
        <p className="mt-1 text-sm text-stone-600">Fill this in after visiting the house. {claim.customer.name} is notified when you save.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="inspection-inspectedOn" className={label}>Inspected On <RequiredIndicator /></label>
          <input id="inspection-inspectedOn" type="date" max={today} value={values.inspectedOn} onChange={(event) => set("inspectedOn", event.target.value)} disabled={busy} className={`${field} h-11`} {...describe("inspectedOn")} />
          <FieldError id="inspection-inspectedOn-error" message={errors.inspectedOn} />
        </div>
        <div>
          <label htmlFor="inspection-inspectedBy" className={label}>Inspected By <RequiredIndicator /></label>
          <input id="inspection-inspectedBy" value={values.inspectedBy} maxLength={warrantyLimits.inspectedBy} onChange={(event) => set("inspectedBy", event.target.value)} placeholder="Enter inspected by" disabled={busy} className={`${field} h-11`} {...describe("inspectedBy")} />
          <FieldError id="inspection-inspectedBy-error" message={errors.inspectedBy} />
        </div>
      </div>
      <div>
        <label htmlFor="inspection-findings" className={label}>Findings <RequiredIndicator /></label>
        <textarea id="inspection-findings" rows={3} value={values.findings} maxLength={warrantyLimits.findings} onChange={(event) => set("findings", event.target.value)} placeholder="Enter findings" disabled={busy} className={`${field} resize-y`} {...describe("findings")} />
        <FieldError id="inspection-findings-error" message={errors.findings} />
      </div>
      <fieldset disabled={busy} {...describe("covered")}>
        <legend className={label}>Result <RequiredIndicator /></legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {[true, false].map((option) => (
            <label key={String(option)} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-stone-200 px-3 py-2.5 has-[:checked]:border-red-700 has-[:checked]:bg-rose-50">
              <input type="radio" name="warranty-result" value={option ? "covered" : "not-covered"} checked={covered === option} onChange={() => { setCovered(option); setErrors((current) => ({ ...current, covered: "", reason: "" })); }} className="mt-0.5 h-4 w-4 accent-red-700" />
              <span>
                <span className="block text-sm font-semibold">{option ? "Covered" : "Not covered"}</span>
                <span className="mt-0.5 block text-xs text-stone-600">{option ? "G4 Builders repairs it for free." : "Choose the reason below. The customer is told why."}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="inspection-covered-error" message={errors.covered} />
      </fieldset>
      {covered === false ? (
        <div>
          <label htmlFor="inspection-reason" className={label}>Reason <RequiredIndicator /></label>
          <select id="inspection-reason" value={values.reason} onChange={(event) => set("reason", event.target.value)} disabled={busy} className={`${field} h-11`} {...describe("reason")}>
            <option value="">Select reason</option>
            {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
          <FieldError id="inspection-reason-error" message={errors.reason} />
        </div>
      ) : null}
      <div>
        <p className={label}>Inspection Photos <span className="font-normal text-stone-500">(optional, up to {maxInspectionPhotos})</span></p>
        {photos.length ? (
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((photo, index) => (
              <li key={index} className="relative aspect-square overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                <Image src={photo} alt={`Inspection photo ${index + 1}`} fill unoptimized className="object-cover" />
                <button type="button" onClick={() => setPhotos((current) => current.filter((_, position) => position !== index))} disabled={busy} aria-label={`Remove inspection photo ${index + 1}`} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-md bg-white/90 text-stone-700 shadow hover:text-red-700">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {photos.length < maxInspectionPhotos ? (
          <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            Add Photos
            <input type="file" multiple accept={embeddedImageAccept} onChange={(event) => void addPhotos(event)} disabled={busy} className="sr-only" />
          </label>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className="min-h-11">
          {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />}
          {busy ? "Saving…" : "Save Inspection Result"}
        </Button>
      </div>
    </form>
  );
}

function MarkRepairedForm({ claim, onSaved }: { claim: WarrantyClaimDto; onSaved: (claim: WarrantyClaimDto, message: string) => void }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await sendAction(claim.id, { action: "mark-repaired", notes: notes.trim() });
      onSaved(saved, `${claim.reference} is marked repaired. ${claim.customer.name} was asked to confirm it's fixed.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The repair could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className={`${panel} space-y-3 border-2 border-rose-200`}>
      <div>
        <h3 className="text-base font-semibold tracking-tight">Finish the Repair</h3>
        <p className="mt-1 text-sm text-stone-600">After the repair visit, mark it repaired. {claim.customer.name} is asked to confirm it&apos;s fixed.</p>
      </div>
      <label className={label}>
        Repair Notes
        <span className="block text-xs font-normal text-stone-500">Optional. What was fixed, for the customer and the record.</span>
        <textarea rows={3} value={notes} maxLength={warrantyLimits.repairNotes} onChange={(event) => setNotes(event.target.value)} placeholder="Enter repair notes" disabled={busy} className={`${field} resize-y`} />
      </label>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy} className="min-h-11">
          {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Wrench className="mr-2 h-4 w-4" aria-hidden="true" />}
          {busy ? "Saving…" : "Mark Repaired"}
        </Button>
      </div>
    </form>
  );
}

/** How many claims need the Admin's attention, for the tab badge. */
export function openClaimCount(data: WarrantyClaimsResponse | null) {
  return (data?.claims ?? []).filter((claim) => openWarrantyClaimStatuses.includes(claim.status) && claim.status !== "Repaired").length;
}
