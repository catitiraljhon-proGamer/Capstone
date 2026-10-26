"use client";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { PesoInput } from "@/components/ui/peso-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { billingDate } from "@/components/billing/billing-primitives";
import { fromCentavos, toCentavos } from "@/lib/billing";
import {
  buildPaymentSchedule,
  defaultScheduleTemplate,
  lineAmount,
  MIN_DOWNPAYMENT_PERCENT,
  scheduleTemplateError,
} from "@/lib/construction";
import { amountError, dateError, numberError, textError } from "@/lib/form-validation";
import { formatPeso } from "@/lib/house-design-data";
import { type Material, materialNameKey } from "@/lib/materials";
import type {
  CostEstimateDto,
  EstimateLineItem,
  EstimateLineItemInput,
  EstimateRevisionChange,
  EstimateStatus,
  MilestoneTemplate,
} from "@/types/construction";
import { ChevronRight, EyeOff, FolderKanban, Lock, Plus, Send, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 disabled:bg-stone-100 aria-invalid:border-red-600";
const headClass = "px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";

export const formatEstimateDate = (value: string | null | undefined) => (value ? billingDate(value) : "—");

const pillTone: Record<EstimateStatus, string> = {
  Requested: "bg-stone-100 text-stone-700 ring-stone-200",
  Draft: "bg-stone-100 text-stone-700 ring-stone-200",
  "Revision requested": "bg-rose-100 text-red-800 ring-rose-300",
  Sent: "bg-rose-50 text-red-700 ring-rose-200",
  Accepted: "bg-stone-900 text-white ring-stone-900",
};

export function EstimateStatusPill({ status }: { status: EstimateStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${pillTone[status]}`}>
      {status}
    </span>
  );
}

let rowCounter = 0;
const nextKey = () => ++rowCounter;

/** A material in a scope of work. Its price comes from Maintenance > Materials; the admin types only the quantity. */
type MaterialRow = { key: number; materialId: string; name: string; savedPrice: number; quantity: string };
/**
 * One scope of work, saved as 1 lot. With materials its amount is their total; without any it keeps the lump sum
 * typed in Amount, as older estimates did.
 */
type LineRow = { key: number; scope: string; amount: string; materials: MaterialRow[]; open: boolean };
type ScheduleRow = { key: number; label: string; description: string; percentage: string; targetDate: string };

const toLineRows = (items: EstimateLineItem[]): LineRow[] =>
  items.map((line) => ({
    key: nextKey(),
    // Older itemized lines fold their description into the scope text.
    scope: (line.description ? `${line.item} – ${line.description}` : line.item).slice(0, 160),
    amount: line.materials?.length ? "" : String(lineAmount(line.quantity, line.unitPrice)),
    materials: (line.materials ?? []).flatMap((material) => (material.materialId ? [{
      key: nextKey(), materialId: material.materialId, name: material.name,
      savedPrice: material.unitPrice ?? 0, quantity: String(material.quantity ?? ""),
    }] : [])),
    open: false,
  }));

const toScheduleRows = (template: MilestoneTemplate[]): ScheduleRow[] =>
  template.map((row) => ({
    key: nextKey(),
    label: row.label,
    description: row.description,
    percentage: String(row.percentage),
    targetDate: row.targetDate,
  }));

const num = (value: string) => {
  const parsed = value.trim() === "" ? 0 : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type PriceOf = (material: MaterialRow) => number;

const quantityError = (text: string) =>
  numberError(text, { label: "Quantity", max: 10_000_000, maxDecimals: 2 }) ?? (Number(text) > 0 ? null : "Quantity must be more than 0.");
const materialAmount = (material: MaterialRow, priceOf: PriceOf) =>
  (quantityError(material.quantity) ? 0 : lineAmount(Number(material.quantity), priceOf(material)));
const rowAmount = (row: LineRow, priceOf: PriceOf) => (row.materials.length
  ? fromCentavos(row.materials.reduce((sum, material) => sum + toCentavos(materialAmount(material, priceOf)), 0))
  : num(row.amount));

/** The server prices each material again from Maintenance when the estimate is saved. */
const fromLineRows = (rows: LineRow[]): EstimateLineItemInput[] =>
  rows.map((row) => (row.materials.length
    ? {
      item: row.scope.trim(), description: "", unit: "lot", quantity: 1, unitPrice: 0,
      materials: row.materials.map((material) => ({ materialId: material.materialId, quantity: num(material.quantity) })),
    }
    : { item: row.scope.trim(), description: "", unit: "lot", quantity: 1, unitPrice: num(row.amount) }));

const sameName = (a: string, b: string) => materialNameKey(a) === materialNameKey(b);
/** The customer's request for this material, if they asked to change it. */
const changeFor = (changes: EstimateRevisionChange[], row: LineRow, material: MaterialRow) =>
  changes.find((change) => sameName(change.scope, row.scope) && sameName(change.material, material.name));
/** A change is done once the material is no longer in that scope, replaced or removed. */
const changeDone = (change: EstimateRevisionChange, rows: LineRow[]) =>
  !rows.some((row) => sameName(row.scope, change.scope) && row.materials.some((material) => sameName(material.name, change.material)));

const fromScheduleRows = (rows: ScheduleRow[]): MilestoneTemplate[] =>
  rows.map((row) => ({
    label: row.label.trim(),
    description: row.description.trim(),
    percentage: num(row.percentage),
    targetDate: row.targetDate,
  }));

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? fallback);
  return payload;
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {note ? <p className="mt-1 text-sm text-stone-600">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-stone-950">{children}</dd>
    </div>
  );
}

/** `lines` are the scopes being edited, so each material change shows whether it is done yet. */
function DetailsCard({ estimate, lines }: { estimate: CostEstimateDto; lines?: LineRow[] }) {
  const changes = estimate.revisionChanges;
  return (
    <Card title="Request Details">
      {estimate.revisionNote || changes.length ? (
        <div role="note" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-stone-800">
          <p className="font-semibold text-red-800">Customer requested a revision</p>
          {changes.length ? (
            <>
              <p className="mt-1 text-stone-600">
                Replace each material in its scope of work below, then send the updated estimate. The new price comes from Maintenance › Materials.
              </p>
              <ul className="mt-3 space-y-1.5">
                {changes.map((change, index) => {
                  const done = lines ? changeDone(change, lines) : false;
                  return (
                    <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="text-stone-500">{change.scope}:</span> {change.material} → <strong className="text-red-800">{change.wants}</strong>
                      </span>
                      {lines ? (
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${done ? "bg-stone-100 text-stone-700" : "bg-rose-100 text-red-800"}`}>
                          {done ? "Done" : "To do"}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          {estimate.revisionNote ? (
            <p className="mt-2 whitespace-pre-wrap">
              {changes.length ? <span className="font-semibold">Other changes: </span> : null}
              {estimate.revisionNote}
            </p>
          ) : null}
        </div>
      ) : null}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Customer">
          {estimate.customer.name}
          <span className="block text-xs text-stone-500">{estimate.customer.email}</span>
        </Detail>
        <Detail label="Design">
          {estimate.designLabel}
          {estimate.floorArea || estimate.finish ? (
            <span className="block text-xs text-stone-500">
              {[estimate.floorArea ? `${estimate.floorArea} sq m` : null, estimate.finish ? `${estimate.finish} finish` : null].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </Detail>
        <Detail label="Preferred Start Date">{formatEstimateDate(estimate.preferredStartDate)}</Detail>
        <Detail label="Needed by">{formatEstimateDate(estimate.neededBy)}</Detail>
        <Detail label="Site Address">{estimate.siteAddress || "—"}</Detail>
        <Detail label="Customer Notes">
          <span className="whitespace-pre-wrap">{estimate.customerNotes || "—"}</span>
        </Detail>
      </dl>
    </Card>
  );
}

/** The amounts above add up to the contract total; G4 Builders adds no VAT. */
function TotalsBox({ total }: { total: number }) {
  return (
    <dl className="ml-auto mt-4 w-full max-w-sm text-sm">
      <div className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-base">
        <dt className="font-semibold">Contract Total</dt>
        <dd className="font-semibold tabular-nums text-red-700">{formatPeso(total)}</dd>
      </div>
    </dl>
  );
}

function SchedulePreview({ total, template, downpaymentPercent }: { total: number; template: MilestoneTemplate[]; downpaymentPercent?: number }) {
  const rows = useMemo(() => {
    if (total <= 0 || scheduleTemplateError(template)) return null;
    try {
      return buildPaymentSchedule(total, template, downpaymentPercent ?? template[0].percentage);
    } catch {
      return null;
    }
  }, [total, template, downpaymentPercent]);
  if (!rows) return null;
  return (
    <div className="mt-4 min-w-0">
      <p className="text-sm font-semibold">Payment Preview</p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className={headClass}>Milestone</th>
              <th className={`${headClass} text-right`}>%</th>
              <th className={`${headClass} text-right`}>Amount</th>
              <th className={headClass}>Target Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="px-3 py-3 font-medium">{row.label}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.percentage}%</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{formatPeso(row.amount)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-stone-600">{formatEstimateDate(row.targetDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        Customers may pay a larger downpayment; the remaining milestones then scale down proportionally.
      </p>
    </div>
  );
}

/** A sent estimate's scopes; each one with materials opens to show them with their saved prices. */
function ReadOnlyScopes({ lineItems }: { lineItems: EstimateLineItem[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead className="border-y border-stone-200 bg-stone-50">
          <tr>
            <th className={headClass}>Scope of Works</th>
            <th className={`${headClass} w-16 text-right`}>Qty</th>
            <th className={`${headClass} w-16`}>Unit</th>
            <th className={`${headClass} w-40 text-right`}>Amount</th>
          </tr>
        </thead>
        {lineItems.map((line) => {
          const materials = line.materials ?? [];
          const isOpen = open.has(line.id);
          const name = line.description ? `${line.item} – ${line.description}` : line.item;
          return (
            <tbody key={line.id} className="border-b border-stone-100">
              <tr>
                <td className="px-3 py-3 font-medium">
                  {materials.length ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`est-view-${line.id}`}
                      onClick={() => toggle(line.id)}
                      className="inline-flex items-center gap-2 text-left font-medium text-stone-950 hover:text-red-800"
                    >
                      <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 text-red-700 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      {name}
                    </button>
                  ) : <span className="pl-6">{name}</span>}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{line.quantity}</td>
                <td className="px-3 py-3">{line.unit}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">{formatPeso(line.amount)}</td>
              </tr>
              {isOpen ? (
                <tr id={`est-view-${line.id}`}>
                  <td colSpan={4} className="pb-4 pl-9 pr-3">
                    <table className="w-full border-collapse rounded-lg bg-stone-50 text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                          <th className="px-3 py-2">Material</th>
                          <th className="w-36 px-3 py-2 text-right">Price</th>
                          <th className="w-28 px-3 py-2 text-right">Qty</th>
                          <th className="w-36 px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200/70">
                        {materials.map((material) => (
                          <tr key={material.id}>
                            <td className="px-3 py-2.5 font-medium">{material.name}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-stone-700">{formatPeso(material.unitPrice ?? 0)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{material.quantity}</td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatPeso(material.amount ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function ReadOnlyEstimate({ estimate }: { estimate: CostEstimateDto }) {
  return (
    <div className="space-y-5">
      <DetailsCard estimate={estimate} />

      <Card title="Scope of Works">
        <ReadOnlyScopes lineItems={estimate.lineItems} />
        <TotalsBox total={estimate.total} />
      </Card>

      <Card title="Payment Schedule">
        {estimate.status === "Accepted" && estimate.downpaymentPercent != null ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm">
            <p>
              Accepted on {formatEstimateDate(estimate.acceptedAt)} with a{" "}
              <strong className="text-red-800">{estimate.downpaymentPercent}% downpayment</strong>.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/projects">
                <FolderKanban className="mr-1.5 h-4 w-4" /> View in Projects
              </Link>
            </Button>
          </div>
        ) : estimate.sentAt ? (
          <p className="mb-4 text-sm text-stone-600">
            Sent to the customer on {formatEstimateDate(estimate.sentAt)}. Waiting for acceptance.
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="bg-stone-50">
              <tr>
                <th className={headClass}>Milestone</th>
                <th className={headClass}>Description</th>
                <th className={`${headClass} text-right`}>Template %</th>
                <th className={headClass}>Target Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {estimate.scheduleTemplate.map((row, index) => (
                <tr key={index}>
                  <td className="px-3 py-3 font-medium">{row.label}</td>
                  <td className="px-3 py-3 text-stone-600">{row.description || "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.percentage}%</td>
                  <td className="whitespace-nowrap px-3 py-3 text-stone-600">{formatEstimateDate(row.targetDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SchedulePreview
          total={estimate.total}
          template={estimate.scheduleTemplate}
          downpaymentPercent={estimate.downpaymentPercent ?? undefined}
        />
      </Card>

      {estimate.adminNotes ? (
        <Card title="Admin Notes">
          <p className="whitespace-pre-wrap text-sm text-stone-700">{estimate.adminNotes}</p>
        </Card>
      ) : null}
    </div>
  );
}

type Issue = { id: string; where: string; message: string };

const blankLine = (): LineRow => ({ key: nextKey(), scope: "", amount: "", materials: [], open: true });
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function lineErrors(row: LineRow) {
  return {
    scope: textError(row.scope, { label: "Scope of work", max: 160 }),
    amount: row.materials.length
      ? null
      : row.amount.trim() === ""
        ? "Add materials, or enter a lump-sum amount."
        : amountError(row.amount, { label: "Amount", max: 1_000_000_000 }),
  };
}

/** Opens the scopes the customer asked to change, or the first scope when there is no request. */
function initialLines(estimate: CostEstimateDto) {
  if (!estimate.lineItems.length) return [blankLine()];
  const rows = toLineRows(estimate.lineItems);
  const flagged = rows.map((row) => row.materials.some((material) => changeFor(estimate.revisionChanges, row, material)));
  return rows.map((row, index) => ({ ...row, open: flagged.some(Boolean) ? flagged[index] : index === 0 }));
}

async function loadMaterials() {
  const response = await fetch("/api/maintenance/materials", { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { materials?: Material[]; error?: string };
  if (!response.ok || !payload.materials) throw new Error(payload.error ?? "Unable to load the materials.");
  return payload.materials;
}

function scheduleErrors(row: ScheduleRow, index: number, previous: ScheduleRow | undefined) {
  const base = numberError(row.percentage, { label: "Percentage", max: 100, maxDecimals: 2, unit: "%" });
  const value = Number(row.percentage);
  const percentage =
    base ??
    (index === 0 && value < MIN_DOWNPAYMENT_PERCENT
      ? `The downpayment must be at least ${MIN_DOWNPAYMENT_PERCENT}%.`
      : value <= 0
        ? "Percentage must be more than 0%."
        : null);
  return {
    label: textError(row.label, { label: "Milestone name", min: 3, max: 120 }),
    percentage,
    targetDate: dateError(row.targetDate, {
      label: "Target Date",
      min: previous && isoDate.test(previous.targetDate) ? previous.targetDate : undefined,
      minLabel: "the previous milestone's date",
    }),
  };
}

/** Rules the save endpoint enforces; everything else may stay incomplete in a draft. */
const draftBlocksSchedule = (row: ScheduleRow) => ({
  label: row.label.trim() === "",
  percentage: row.percentage.trim() !== "" && !(Number(row.percentage) >= 0 && Number(row.percentage) <= 100),
});

function EditableEstimate({ estimate, onUpdated }: { estimate: CostEstimateDto; onUpdated: (estimate: CostEstimateDto) => void }) {
  const [lines, setLines] = useState<LineRow[]>(() => initialLines(estimate));
  const [catalog, setCatalog] = useState<Material[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow[]>(() =>
    toScheduleRows(
      estimate.scheduleTemplate.length > 0
        ? estimate.scheduleTemplate
        : defaultScheduleTemplate(estimate.preferredStartDate, estimate.neededBy),
    ),
  );
  const [adminNotes, setAdminNotes] = useState(estimate.adminNotes);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [sendAttempted, setSendAttempted] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      loadMaterials()
        .then((materials) => {
          if (!active) return;
          setCatalog(materials);
          setCatalogError(null);
        })
        .catch((loadError: unknown) => {
          if (active) setCatalogError(loadError instanceof Error ? loadError.message : "Unable to load the materials.");
        });
    };
    refresh();
    // A material added in Maintenance from another tab shows up when the admin comes back.
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const catalogById = useMemo(() => new Map((catalog ?? []).map((material) => [material.id, material])), [catalog]);
  /** Today's price in Maintenance; the saved price until the list loads. */
  const priceOf: PriceOf = (material) => catalogById.get(material.materialId)?.price ?? material.savedPrice;
  const changes = estimate.revisionChanges;

  const template = useMemo(() => fromScheduleRows(schedule), [schedule]);
  const totals = { total: fromCentavos(lines.reduce((sum, row) => sum + toCentavos(rowAmount(row, priceOf)), 0)) };
  const scheduleError = useMemo(() => scheduleTemplateError(template), [template]);
  const percentTotal = template.reduce((sum, row) => sum + row.percentage, 0);
  const lineErrorRows = useMemo(() => lines.map(lineErrors), [lines]);
  const scheduleErrorRows = useMemo(() => schedule.map((row, index) => scheduleErrors(row, index, schedule[index - 1])), [schedule]);
  const totalError = totals.total <= 0 ? "Add at least one scope of work with materials or an amount before sending." : null;

  const touch = (id: string) => setTouched((current) => (current.has(id) ? current : new Set(current).add(id)));
  const shown = (id: string, message: string | null) => (submitted || touched.has(id) ? message : null);
  /** Shared id and accessibility attributes for an input with an inline message. */
  const field = (id: string, message: string | null) => ({
    id,
    "aria-invalid": message ? (true as const) : undefined,
    "aria-describedby": message ? `${id}-error` : undefined,
    onBlur: () => touch(id),
  });

  function collectIssues(mode: "save" | "send"): Issue[] {
    const issues: Issue[] = [];
    if (lines.length === 0) issues.push({ id: "est-add-line", where: "Scope of Works", message: "Add at least one scope of work." });
    lines.forEach((row, index) => {
      const errors = lineErrorRows[index];
      (["scope", "amount"] as const).forEach((name) => {
        const message = errors[name];
        if (message) issues.push({ id: `est-line-${row.key}-${name}`, where: `Scope of work ${index + 1}`, message });
      });
      row.materials.forEach((material) => {
        const message = quantityError(material.quantity);
        if (message) issues.push({ id: `est-mat-${material.key}-qty`, where: `${row.scope.trim() || `Scope of work ${index + 1}`}, ${material.name}`, message });
      });
    });
    schedule.forEach((row, index) => {
      const errors = scheduleErrorRows[index];
      const blocks = draftBlocksSchedule(row);
      (["label", "percentage", "targetDate"] as const).forEach((name) => {
        const message = errors[name];
        if (!message) return;
        if (mode === "save" && !(name === "label" ? blocks.label : name === "percentage" ? blocks.percentage : false)) return;
        issues.push({ id: `est-sched-${row.key}-${name}`, where: `Milestone ${index + 1}`, message });
      });
    });
    if (mode === "send") {
      if (scheduleError && !issues.some((issue) => issue.id.startsWith("est-sched-"))) {
        const last = schedule[schedule.length - 1];
        issues.push({ id: schedule.length < 2 || !last ? "est-add-milestone" : `est-sched-${last.key}-percentage`, where: "Payment Schedule", message: scheduleError });
      }
      if (totalError) issues.push({ id: lines[0] ? `est-line-${lines[0].key}-amount` : "est-add-line", where: "Scope of Works", message: totalError });
    }
    return issues;
  }

  /** Marks every field as checked, reports what to fix, and focuses the first invalid field. */
  function reject(issues: Issue[], verb: string) {
    setSubmitted(true);
    setNotice(null);
    const first = issues[0];
    setError(
      issues.length === 1
        ? `Fix this before ${verb}: ${first.where}: ${first.message}`
        : `Fix ${issues.length} problems before ${verb}. First: ${first.where}: ${first.message}`,
    );
    // Open the scopes whose materials need fixing, so the first one can take focus.
    const flagged = new Set(issues.map((issue) => issue.id));
    setLines((current) => current.map((row) => (
      !row.open && row.materials.some((material) => flagged.has(`est-mat-${material.key}-qty`)) ? { ...row, open: true } : row
    )));
    requestAnimationFrame(() => document.getElementById(first.id)?.focus());
  }

  function updateLine(key: number, patch: Partial<LineRow>) {
    setLines((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function updateMaterials(key: number, change: (materials: MaterialRow[]) => MaterialRow[]) {
    setLines((current) => current.map((row) => (row.key === key ? { ...row, materials: change(row.materials) } : row)));
  }

  function addMaterial(key: number, materialId: string) {
    const material = catalogById.get(materialId);
    if (!material) return;
    updateMaterials(key, (materials) => (materials.some((item) => item.materialId === materialId)
      ? materials
      : [...materials, { key: nextKey(), materialId, name: material.name, savedPrice: material.price, quantity: "1" }]));
  }

  /** Swaps the material the customer asked to change, keeping its quantity; the new price comes from Maintenance. */
  function replaceMaterial(key: number, materialKey: number, replacement: Material) {
    updateMaterials(key, (materials) => (materials.some((item) => item.materialId === replacement.id)
      ? materials.filter((item) => item.key !== materialKey)
      : materials.map((item) => (item.key === materialKey
        ? { ...item, materialId: replacement.id, name: replacement.name, savedPrice: replacement.price }
        : item))));
  }

  function updateSchedule(key: number, patch: Partial<ScheduleRow>) {
    setSchedule((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addScheduleRow() {
    setSchedule((current) => {
      if (current.length >= 8) return current;
      const last = current[current.length - 1];
      return [...current, { key: nextKey(), label: "", description: "", percentage: "0", targetDate: last?.targetDate ?? "" }];
    });
  }

  async function save(): Promise<CostEstimateDto> {
    const response = await fetch(`/api/construction/estimates/${estimate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", lineItems: fromLineRows(lines), scheduleTemplate: template, adminNotes }),
    });
    const payload = await readJson<{ estimate: CostEstimateDto }>(response, "Unable to save this estimate.");
    onUpdated(payload.estimate);
    return payload.estimate;
  }

  async function saveDraft() {
    if (busy) return;
    const issues = collectIssues("save");
    if (issues.length > 0) return reject(issues, "saving");
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      await save();
      setNotice("Draft saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this estimate.");
    } finally {
      setBusy(null);
    }
  }

  async function sendToCustomer() {
    if (busy) return;
    setSendAttempted(true);
    const issues = collectIssues("send");
    if (issues.length > 0) return reject(issues, "sending");
    if (
      !window.confirm(
        `Send this estimate to ${estimate.customer.name}?\n\nContract total: ${formatPeso(totals.total)}. The customer will be able to accept it with a downpayment of at least ${MIN_DOWNPAYMENT_PERCENT}%. You will not be able to edit it afterwards.`,
      )
    ) {
      return;
    }
    setBusy("send");
    setError(null);
    setNotice(null);
    try {
      await save();
      const response = await fetch(`/api/construction/estimates/${estimate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const payload = await readJson<{ estimate: CostEstimateDto }>(response, "Unable to send this estimate.");
      onUpdated(payload.estimate);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send this estimate.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <DetailsCard estimate={estimate} lines={lines} />

      <Card
        title="Scope of Works"
        note="Open a scope of work to list its materials. Prices come from Maintenance › Materials, so you only type the quantity. A scope's amount is the total of its materials; a scope without materials uses the amount you type."
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button
            id="est-add-line"
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(busy)}
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Scope of Work
          </Button>
          {catalogError ? <p role="alert" className="text-sm text-red-700">{catalogError}</p> : null}
        </div>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="border-y border-stone-200 bg-stone-50">
              <tr>
                <th className={`${headClass} w-12`}><span className="sr-only">Materials</span></th>
                <th className={headClass}>Scope of Works</th>
                <th className={`${headClass} w-16 text-right`}>Qty</th>
                <th className={`${headClass} w-16`}>Unit</th>
                <th className={`${headClass} w-36`}>Materials</th>
                <th className={`${headClass} w-48 text-right`}>Amount</th>
                <th className={`${headClass} w-12`}><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            {lines.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-stone-500">
                    No scope of work yet. Add one to start the estimate.
                  </td>
                </tr>
              </tbody>
            ) : null}
            {lines.map((row, index) => {
              const errors = lineErrorRows[index];
              const scopeId = `est-line-${row.key}-scope`;
              const amountId = `est-line-${row.key}-amount`;
              const panelId = `est-line-${row.key}-materials`;
              const scopeMessage = shown(scopeId, errors.scope);
              const amountMessage = shown(amountId, errors.amount);
              const label = row.scope.trim() || `scope of work ${index + 1}`;
              const pending = row.materials.filter((material) => changeFor(changes, row, material)).length;
              const usedIds = new Set(row.materials.map((material) => material.materialId));
              const options = (catalog ?? [])
                .filter((material) => !usedIds.has(material.id))
                .map((material) => ({ value: material.id, label: `${material.name} · ${formatPeso(material.price)}` }));
              return (
                <tbody key={row.key} className="border-b border-stone-100">
                  <tr className="align-top">
                    <td className="px-1 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-expanded={row.open}
                        aria-controls={panelId}
                        aria-label={`${row.open ? "Hide" : "Show"} materials for ${label}`}
                        onClick={() => updateLine(row.key, { open: !row.open })}
                      >
                        <ChevronRight className={`h-5 w-5 text-red-700 transition-transform ${row.open ? "rotate-90" : ""}`} />
                      </Button>
                    </td>
                    <td className="min-w-64 px-2 py-2">
                      <input aria-label={`Scope of work ${index + 1}`} maxLength={160} placeholder="Enter scope of work" className={inputClass} value={row.scope} onChange={(event) => updateLine(row.key, { scope: event.target.value })} {...field(scopeId, scopeMessage)} />
                      <FieldError id={`${scopeId}-error`} message={scopeMessage} />
                    </td>
                    <td className="px-3 py-4 text-right tabular-nums">1</td>
                    <td className="px-3 py-4">lot</td>
                    <td className={`px-3 py-4 ${pending ? "font-medium text-red-700" : "text-stone-600"}`}>
                      {row.materials.length === 0 ? "No materials" : row.materials.length === 1 ? "1 material" : `${row.materials.length} materials`}
                      {pending ? <span className="block text-xs">{pending} to change</span> : null}
                    </td>
                    <td className="px-2 py-2">
                      {row.materials.length ? (
                        <p className="px-1 py-2.5 text-right text-base font-semibold tabular-nums">{formatPeso(rowAmount(row, priceOf))}</p>
                      ) : (
                        <>
                          <PesoInput aria-label={`Amount ${index + 1}`} min="0" step="0.01" value={row.amount} onChange={(event) => updateLine(row.key, { amount: event.target.value })} {...field(amountId, amountMessage)} />
                          <FieldError id={`${amountId}-error`} message={amountMessage} />
                        </>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove scope of work ${index + 1}`} disabled={Boolean(busy)} onClick={() => setLines((current) => current.filter((item) => item.key !== row.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                  {row.open ? (
                    <tr>
                      <td colSpan={7} className="pb-4 pl-12 pr-12">
                        <div id={panelId} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                          {row.materials.length ? (
                            <table className="w-full border-collapse text-sm">
                              <thead>
                                <tr className="border-b border-stone-200 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                                  <th className="px-2 py-2">Material</th>
                                  <th className="w-36 px-2 py-2 text-right">Price</th>
                                  <th className="w-32 px-2 py-2 text-right">Qty</th>
                                  <th className="w-36 px-2 py-2 text-right">Amount</th>
                                  <th className="w-10 px-1 py-2"><span className="sr-only">Remove</span></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-200/70">
                                {row.materials.map((material) => {
                                  const change = changeFor(changes, row, material);
                                  const replacement = change ? catalog?.find((item) => sameName(item.name, change.wants)) : undefined;
                                  const qtyId = `est-mat-${material.key}-qty`;
                                  const qtyError = quantityError(material.quantity);
                                  const qtyMessage = shown(qtyId, qtyError);
                                  return (
                                    <tr key={material.key} className={`align-top ${change ? "bg-rose-50" : ""}`}>
                                      <td className="px-2 py-2.5 font-medium">
                                        {material.name}
                                        {change ? (
                                          <div className="mt-1.5 flex flex-wrap items-center gap-2 font-normal">
                                            <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-red-800">Customer wants: {change.wants}</span>
                                            {replacement ? (
                                              <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => replaceMaterial(row.key, material.key, replacement)}>
                                                Replace with {replacement.name}
                                              </Button>
                                            ) : (
                                              <span className="text-xs text-stone-600">
                                                Not in Materials yet.{" "}
                                                <a href="/admin/maintenance?section=materials" target="_blank" rel="noopener noreferrer" className="font-medium text-red-700 underline hover:text-red-900">
                                                  Add it in Maintenance
                                                </a>{" "}
                                                first.
                                              </span>
                                            )}
                                          </div>
                                        ) : null}
                                      </td>
                                      <td className="px-2 py-2.5 text-right tabular-nums text-stone-700">
                                        <span className="inline-flex items-center gap-1.5">
                                          <Lock className="h-3 w-3 text-stone-400" aria-label="Price from Maintenance" />
                                          {formatPeso(priceOf(material))}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          inputMode="decimal"
                                          aria-label={`Quantity of ${material.name}`}
                                          className={`${inputClass} py-2 text-right tabular-nums`}
                                          value={material.quantity}
                                          onChange={(event) => {
                                            const quantity = event.target.value;
                                            updateMaterials(row.key, (materials) => materials.map((item) => (item.key === material.key ? { ...item, quantity } : item)));
                                          }}
                                          {...field(qtyId, qtyMessage)}
                                        />
                                        <div className="text-right"><FieldError id={`${qtyId}-error`} message={qtyMessage} /></div>
                                      </td>
                                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{qtyError ? "—" : formatPeso(materialAmount(material, priceOf))}</td>
                                      <td className="px-1 py-1">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          aria-label={`Remove ${material.name}`}
                                          disabled={Boolean(busy)}
                                          onClick={() => updateMaterials(row.key, (materials) => materials.filter((item) => item.key !== material.key))}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          ) : (
                            <p className="px-2 py-3 text-sm text-stone-500">
                              No materials yet. Search below to add the first one{row.amount.trim() ? ", or keep the lump-sum amount" : ""}.
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                            <div className="w-full max-w-sm">
                              <SearchableSelect
                                id={`est-line-${row.key}-add`}
                                aria-describedby={`est-line-${row.key}-add-hint`}
                                options={options}
                                value=""
                                onChange={(materialId) => { if (materialId) addMaterial(row.key, materialId); }}
                                placeholder="Search materials to add"
                                emptyMessage="No material matches. Add it in Maintenance › Materials first."
                                disabled={!catalog || Boolean(busy)}
                                className={inputClass}
                              />
                              <p id={`est-line-${row.key}-add-hint`} className="mt-1 text-xs text-stone-500">
                                {catalog ? "Type a material name, then pick it from the list." : "Loading the materials…"}
                              </p>
                            </div>
                            {row.materials.length ? (
                              <div className="text-right">
                                <p className="text-sm text-stone-600">
                                  Materials total <strong className="ml-1.5 text-base text-stone-950 tabular-nums">{formatPeso(rowAmount(row, priceOf))}</strong>
                                </p>
                                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-stone-500">
                                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                                  The customer sees only the material names.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}
          </table>
        </div>
        <TotalsBox total={totals.total} />
        {sendAttempted && totalError ? <div className="ml-auto max-w-sm text-right"><FieldError id="est-total-error" message={totalError} /></div> : null}
      </Card>

      <Card
        title="Payment Schedule"
        note={`The first row is the downpayment (at least ${MIN_DOWNPAYMENT_PERCENT}%). Percentages must add up to 100%, with 2 to 8 milestones.`}
      >
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="border-y border-stone-200 bg-stone-50">
              <tr>
                <th className={headClass}>Milestone</th>
                <th className={headClass}>Description</th>
                <th className={headClass}>%</th>
                <th className={headClass}>Target Date</th>
                <th className={headClass}><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {schedule.map((row, index) => {
                const errors = scheduleErrorRows[index];
                const labelId = `est-sched-${row.key}-label`;
                const percentId = `est-sched-${row.key}-percentage`;
                const dateId = `est-sched-${row.key}-targetDate`;
                const labelMessage = shown(labelId, errors.label);
                const percentMessage = shown(percentId, errors.percentage);
                const dateMessage = shown(dateId, errors.targetDate);
                return (
                  <tr key={row.key} className="align-top">
                    <td className="w-56 px-2 py-2">
                      <input aria-label={`Milestone ${index + 1} label`} maxLength={120} className={inputClass} value={row.label} onChange={(event) => updateSchedule(row.key, { label: event.target.value })} {...field(labelId, labelMessage)} />
                      <FieldError id={`${labelId}-error`} message={labelMessage} />
                      {index === 0 ? <span className="mt-1 block text-xs text-stone-500">Downpayment</span> : null}
                    </td>
                    <td className="min-w-56 px-2 py-2">
                      <input aria-label={`Milestone ${index + 1} description`} maxLength={400} className={inputClass} value={row.description} onChange={(event) => updateSchedule(row.key, { description: event.target.value })} />
                    </td>
                    <td className="w-28 px-2 py-2">
                      <input aria-label={`Milestone ${index + 1} percentage`} type="number" min="0" max="100" step="0.01" inputMode="decimal" className={`${inputClass} tabular-nums`} value={row.percentage} onChange={(event) => updateSchedule(row.key, { percentage: event.target.value })} {...field(percentId, percentMessage)} />
                      <FieldError id={`${percentId}-error`} message={percentMessage} />
                    </td>
                    <td className="w-44 px-2 py-2">
                      <input aria-label={`Milestone ${index + 1} target date`} type="date" className={inputClass} value={row.targetDate} onChange={(event) => updateSchedule(row.key, { targetDate: event.target.value })} {...field(dateId, dateMessage)} />
                      <FieldError id={`${dateId}-error`} message={dateMessage} />
                    </td>
                    <td className="w-12 px-2 py-2">
                      {index > 0 ? (
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remove milestone ${index + 1}`} disabled={Boolean(busy) || schedule.length <= 2} onClick={() => setSchedule((current) => current.filter((item) => item.key !== row.key))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button id="est-add-milestone" type="button" variant="outline" size="sm" disabled={Boolean(busy) || schedule.length >= 8} onClick={addScheduleRow}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Milestone
          </Button>
          <p className={`text-sm font-medium tabular-nums ${Math.abs(percentTotal - 100) > 0.001 ? "text-red-700" : "text-stone-600"}`}>
            Total: {Math.round(percentTotal * 100) / 100}%
          </p>
        </div>
        {scheduleError ? (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {scheduleError}
          </p>
        ) : null}
        <SchedulePreview total={totals.total} template={template} />
      </Card>

      <Card title="Admin Notes" note="Shown to the customer with the estimate. Mention inclusions, exclusions, or validity.">
        <textarea
          rows={4}
          maxLength={2000}
          className={inputClass}
          aria-label="Admin notes"
          value={adminNotes}
          onChange={(event) => setAdminNotes(event.target.value)}
        />
      </Card>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-stone-800">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void saveDraft()}>
          {busy === "save" ? "Saving…" : "Save Draft"}
        </Button>
        <Button type="button" disabled={Boolean(busy)} onClick={() => void sendToCustomer()}>
          <Send className="mr-1.5 h-4 w-4" />
          {busy === "send" ? "Sending…" : "Send to Customer"}
        </Button>
      </div>
    </div>
  );
}

export function EstimateBuilder({ estimate, onUpdated }: { estimate: CostEstimateDto; onUpdated: (estimate: CostEstimateDto) => void }) {
  const editable = estimate.status === "Requested" || estimate.status === "Draft" || estimate.status === "Revision requested";
  return editable ? <EditableEstimate estimate={estimate} onUpdated={onUpdated} /> : <ReadOnlyEstimate estimate={estimate} />;
}
