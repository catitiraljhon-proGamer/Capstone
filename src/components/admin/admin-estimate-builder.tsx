"use client";

import { Button } from "@/components/ui/button";
import { PesoInput } from "@/components/ui/peso-input";
import { billingDate } from "@/components/billing/billing-primitives";
import {
  buildPaymentSchedule,
  defaultScheduleTemplate,
  estimateTotals,
  lineAmount,
  MIN_DOWNPAYMENT_PERCENT,
  scheduleTemplateError,
  VAT_RATE,
} from "@/lib/construction";
import { formatPeso } from "@/lib/house-design-data";
import type {
  CostEstimateDto,
  EstimateLineItemInput,
  EstimateStatus,
  MilestoneTemplate,
} from "@/types/construction";
import { FolderKanban, LoaderCircle, Plus, Send, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 disabled:bg-stone-100";
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

type LineRow = { key: number; item: string; description: string; unit: string; quantity: string; unitPrice: string };
type ScheduleRow = { key: number; label: string; description: string; percentage: string; targetDate: string };

const toLineRows = (items: EstimateLineItemInput[]): LineRow[] =>
  items.map((line) => ({
    key: nextKey(),
    item: line.item,
    description: line.description,
    unit: line.unit,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice),
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

const fromLineRows = (rows: LineRow[]): EstimateLineItemInput[] =>
  rows.map((row) => ({
    item: row.item.trim(),
    description: row.description.trim(),
    unit: row.unit.trim(),
    quantity: num(row.quantity),
    unitPrice: num(row.unitPrice),
  }));

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

function DetailsCard({ estimate }: { estimate: CostEstimateDto }) {
  return (
    <Card title="Request details">
      {estimate.revisionNote ? (
        <div role="note" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-stone-800">
          <p className="font-semibold text-red-800">Customer requested a revision</p>
          <p className="mt-1 whitespace-pre-wrap">{estimate.revisionNote}</p>
        </div>
      ) : null}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Customer">
          {estimate.customer.name}
          <span className="block text-xs text-stone-500">{estimate.customer.email}</span>
        </Detail>
        <Detail label="Design">
          {estimate.designLabel}
          {estimate.floorArea ? (
            <span className="block text-xs text-stone-500">
              {estimate.floorArea} sq m{estimate.finish ? ` · ${estimate.finish}` : ""}
            </span>
          ) : null}
        </Detail>
        <Detail label="Preferred start date">{formatEstimateDate(estimate.preferredStartDate)}</Detail>
        <Detail label="Needed by">{formatEstimateDate(estimate.neededBy)}</Detail>
        <Detail label="Site address">{estimate.siteAddress || "—"}</Detail>
        <Detail label="Customer notes">
          <span className="whitespace-pre-wrap">{estimate.customerNotes || "—"}</span>
        </Detail>
      </dl>
    </Card>
  );
}

function TotalsBox({ subtotal, vat, total }: { subtotal: number; vat: number; total: number }) {
  return (
    <dl className="ml-auto mt-4 w-full max-w-sm space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-stone-600">Subtotal</dt>
        <dd className="font-medium tabular-nums">{formatPeso(subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-stone-600">VAT ({Math.round(VAT_RATE * 100)}%)</dt>
        <dd className="font-medium tabular-nums">{formatPeso(vat)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-stone-200 pt-3 text-base">
        <dt className="font-semibold">Contract total</dt>
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
      <p className="text-sm font-semibold">Payment preview</p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-stone-200">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className={headClass}>Milestone</th>
              <th className={`${headClass} text-right`}>%</th>
              <th className={`${headClass} text-right`}>Amount</th>
              <th className={headClass}>Target date</th>
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

function ReadOnlyEstimate({ estimate }: { estimate: CostEstimateDto }) {
  return (
    <div className="space-y-5">
      <DetailsCard estimate={estimate} />

      <Card title="Bill of quantities">
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="border-y border-stone-200 bg-stone-50">
              <tr>
                <th className={headClass}>Item</th>
                <th className={headClass}>Description</th>
                <th className={headClass}>Unit</th>
                <th className={`${headClass} text-right`}>Qty</th>
                <th className={`${headClass} text-right`}>Unit price</th>
                <th className={`${headClass} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {estimate.lineItems.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-3 font-medium">{line.item}</td>
                  <td className="px-3 py-3 text-stone-600">{line.description || "—"}</td>
                  <td className="px-3 py-3">{line.unit}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{line.quantity.toLocaleString("en-PH")}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatPeso(line.unitPrice)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">{formatPeso(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TotalsBox subtotal={estimate.subtotal} vat={estimate.vat} total={estimate.total} />
      </Card>

      <Card title="Payment schedule">
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
                <th className={headClass}>Target date</th>
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
        <Card title="Admin notes">
          <p className="whitespace-pre-wrap text-sm text-stone-700">{estimate.adminNotes}</p>
        </Card>
      ) : null}
    </div>
  );
}

function EditableEstimate({ estimate, onUpdated }: { estimate: CostEstimateDto; onUpdated: (estimate: CostEstimateDto) => void }) {
  const [lines, setLines] = useState<LineRow[]>(() => toLineRows(estimate.lineItems));
  const [schedule, setSchedule] = useState<ScheduleRow[]>(() =>
    toScheduleRows(
      estimate.scheduleTemplate.length > 0
        ? estimate.scheduleTemplate
        : defaultScheduleTemplate(estimate.preferredStartDate, estimate.neededBy),
    ),
  );
  const [adminNotes, setAdminNotes] = useState(estimate.adminNotes);
  const [busy, setBusy] = useState<"save" | "send" | "prefill" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const template = useMemo(() => fromScheduleRows(schedule), [schedule]);
  const totals = useMemo(() => estimateTotals(fromLineRows(lines)), [lines]);
  const scheduleError = useMemo(() => scheduleTemplateError(template), [template]);
  const percentTotal = template.reduce((sum, row) => sum + row.percentage, 0);
  const canSend = !scheduleError && totals.total > 0 && !busy;

  async function loadPrefill() {
    setBusy("prefill");
    setError(null);
    try {
      const response = await fetch(`/api/construction/estimates/${estimate.id}/prefill`, { cache: "no-store" });
      const prefill = await readJson<{ lineItems: EstimateLineItemInput[]; scheduleTemplate: MilestoneTemplate[] }>(
        response,
        "Unable to prefill from the design.",
      );
      setLines(toLineRows(prefill.lineItems));
      if (prefill.scheduleTemplate.length > 0) setSchedule(toScheduleRows(prefill.scheduleTemplate));
      setNotice("Prefilled from the design. Review and adjust before sending.");
    } catch (prefillError) {
      setError(prefillError instanceof Error ? prefillError.message : "Unable to prefill from the design.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (estimate.lineItems.length > 0) return;
    let active = true;
    fetch(`/api/construction/estimates/${estimate.id}/prefill`, { cache: "no-store" })
      .then((response) =>
        readJson<{ lineItems: EstimateLineItemInput[]; scheduleTemplate: MilestoneTemplate[] }>(response, "Unable to prefill from the design."),
      )
      .then((prefill) => {
        if (!active) return;
        setLines((current) => (current.length === 0 ? toLineRows(prefill.lineItems) : current));
        if (prefill.scheduleTemplate.length > 0) setSchedule(toScheduleRows(prefill.scheduleTemplate));
        setNotice("Line items prefilled from the selected design. Review and adjust before sending.");
      })
      .catch(() => {
        // Auto-prefill is best effort; the admin can still build the BOQ manually.
      });
    return () => {
      active = false;
    };
  }, [estimate.id, estimate.lineItems.length]);

  function updateLine(key: number, patch: Partial<LineRow>) {
    setLines((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
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

  function validateLines() {
    if (lines.length === 0) return "Add at least one line item.";
    if (lines.some((row) => !row.item.trim())) return "Every line item needs a name.";
    if (lines.some((row) => !(num(row.quantity) > 0))) return "Every line item needs a quantity above 0.";
    return null;
  }

  async function save(): Promise<CostEstimateDto | null> {
    const lineError = validateLines();
    if (lineError) {
      setError(lineError);
      return null;
    }
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
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const saved = await save();
      if (saved) setNotice("Draft saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this estimate.");
    } finally {
      setBusy(null);
    }
  }

  async function sendToCustomer() {
    if (!canSend) return;
    if (
      !window.confirm(
        `Send this estimate to ${estimate.customer.name}?\n\nContract total: ${formatPeso(totals.total)} (incl. 12% VAT). The customer will be able to accept it with a downpayment of at least ${MIN_DOWNPAYMENT_PERCENT}%. You will not be able to edit it afterwards.`,
      )
    ) {
      return;
    }
    setBusy("send");
    setError(null);
    setNotice(null);
    try {
      const saved = await save();
      if (!saved) return;
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

  function confirmPrefill() {
    const hasContent = lines.some((row) => row.item.trim());
    if (hasContent && !window.confirm("Replace the current line items and schedule with the design's prefill?")) return;
    void loadPrefill();
  }

  return (
    <div className="space-y-5">
      <DetailsCard estimate={estimate} />

      <Card title="Bill of quantities" note="Itemize the work. Amounts are quantity × unit price.">
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={Boolean(busy) || !estimate.designRequestId} onClick={confirmPrefill}>
            {busy === "prefill" ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
            Prefill from design
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={Boolean(busy)}
            onClick={() => setLines((current) => [...current, { key: nextKey(), item: "", description: "", unit: "lot", quantity: "1", unitPrice: "0" }])}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add line item
          </Button>
        </div>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead className="border-y border-stone-200 bg-stone-50">
              <tr>
                <th className={headClass}>Item</th>
                <th className={headClass}>Description</th>
                <th className={headClass}>Unit</th>
                <th className={headClass}>Quantity</th>
                <th className={headClass}>Unit price</th>
                <th className={`${headClass} text-right`}>Amount</th>
                <th className={headClass}><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-stone-500">
                    No line items yet. Prefill from the design or add one manually.
                  </td>
                </tr>
              ) : null}
              {lines.map((row, index) => (
                <tr key={row.key}>
                  <td className="w-44 px-2 py-2">
                    <input aria-label={`Item ${index + 1}`} maxLength={160} className={inputClass} value={row.item} onChange={(event) => updateLine(row.key, { item: event.target.value })} />
                  </td>
                  <td className="min-w-48 px-2 py-2">
                    <input aria-label={`Description ${index + 1}`} maxLength={400} className={inputClass} value={row.description} onChange={(event) => updateLine(row.key, { description: event.target.value })} />
                  </td>
                  <td className="w-24 px-2 py-2">
                    <input aria-label={`Unit ${index + 1}`} maxLength={24} className={inputClass} value={row.unit} onChange={(event) => updateLine(row.key, { unit: event.target.value })} />
                  </td>
                  <td className="w-28 px-2 py-2">
                    <input aria-label={`Quantity ${index + 1}`} type="number" min="0" step="any" inputMode="decimal" className={`${inputClass} tabular-nums`} value={row.quantity} onChange={(event) => updateLine(row.key, { quantity: event.target.value })} />
                  </td>
                  <td className="w-40 px-2 py-2">
                    <PesoInput aria-label={`Unit price ${index + 1}`} min="0" step="0.01" value={row.unitPrice} onChange={(event) => updateLine(row.key, { unitPrice: event.target.value })} />
                  </td>
                  <td className="w-36 whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                    {formatPeso(lineAmount(num(row.quantity), num(row.unitPrice)))}
                  </td>
                  <td className="w-12 px-2 py-2">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove line item ${index + 1}`} disabled={Boolean(busy)} onClick={() => setLines((current) => current.filter((item) => item.key !== row.key))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TotalsBox {...totals} />
      </Card>

      <Card
        title="Payment schedule"
        note={`The first row is the downpayment (at least ${MIN_DOWNPAYMENT_PERCENT}%). Percentages must add up to 100%, with 2 to 8 milestones.`}
      >
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="border-y border-stone-200 bg-stone-50">
              <tr>
                <th className={headClass}>Milestone</th>
                <th className={headClass}>Description</th>
                <th className={headClass}>%</th>
                <th className={headClass}>Target date</th>
                <th className={headClass}><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {schedule.map((row, index) => (
                <tr key={row.key}>
                  <td className="w-56 px-2 py-2">
                    <input aria-label={`Milestone ${index + 1} label`} maxLength={120} className={inputClass} value={row.label} onChange={(event) => updateSchedule(row.key, { label: event.target.value })} />
                    {index === 0 ? <span className="mt-1 block text-xs text-stone-500">Downpayment</span> : null}
                  </td>
                  <td className="min-w-56 px-2 py-2">
                    <input aria-label={`Milestone ${index + 1} description`} maxLength={400} className={inputClass} value={row.description} onChange={(event) => updateSchedule(row.key, { description: event.target.value })} />
                  </td>
                  <td className="w-24 px-2 py-2">
                    <input aria-label={`Milestone ${index + 1} percentage`} type="number" min="0" max="100" step="0.01" inputMode="decimal" className={`${inputClass} tabular-nums`} value={row.percentage} onChange={(event) => updateSchedule(row.key, { percentage: event.target.value })} />
                  </td>
                  <td className="w-44 px-2 py-2">
                    <input aria-label={`Milestone ${index + 1} target date`} type="date" className={inputClass} value={row.targetDate} onChange={(event) => updateSchedule(row.key, { targetDate: event.target.value })} />
                  </td>
                  <td className="w-12 px-2 py-2">
                    {index > 0 ? (
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove milestone ${index + 1}`} disabled={Boolean(busy) || schedule.length <= 2} onClick={() => setSchedule((current) => current.filter((item) => item.key !== row.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" disabled={Boolean(busy) || schedule.length >= 8} onClick={addScheduleRow}>
            <Plus className="mr-1.5 h-4 w-4" /> Add milestone
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

      <Card title="Admin notes" note="Shown to the customer with the estimate. Mention inclusions, exclusions, or validity.">
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
        {!canSend && !busy ? (
          <p className="mr-auto text-xs text-stone-500">
            {scheduleError ?? (totals.total <= 0 ? "Add priced line items before sending." : "")}
          </p>
        ) : null}
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => void saveDraft()}>
          {busy === "save" ? "Saving…" : "Save draft"}
        </Button>
        <Button type="button" disabled={!canSend} onClick={() => void sendToCustomer()}>
          <Send className="mr-1.5 h-4 w-4" />
          {busy === "send" ? "Sending…" : "Send to customer"}
        </Button>
      </div>
    </div>
  );
}

export function EstimateBuilder({ estimate, onUpdated }: { estimate: CostEstimateDto; onUpdated: (estimate: CostEstimateDto) => void }) {
  const editable = estimate.status === "Requested" || estimate.status === "Draft" || estimate.status === "Revision requested";
  return editable ? <EditableEstimate estimate={estimate} onUpdated={onUpdated} /> : <ReadOnlyEstimate estimate={estimate} />;
}
