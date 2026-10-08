"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardCheck, Hourglass, MessageSquareText } from "lucide-react";
import { BillingDialog, BillingErrorMessage, BillingPanel, billingJson } from "@/components/billing/billing-primitives";
import { constructionFieldClass, constructionLabelClass, dateOrDash, Eyebrow, Fact, ScheduleTable } from "@/components/customer/construction-shared";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { buildPaymentSchedule, MIN_DOWNPAYMENT_PERCENT } from "@/lib/construction";
import { numberError, textError } from "@/lib/form-validation";
import { formatPeso } from "@/lib/house-design-data";
import type { CostEstimateDto, EstimateAction } from "@/types/construction";

async function sendAction(id: string, action: EstimateAction) {
  const response = await fetch(`/api/construction/estimates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
  return billingJson<{ estimate: CostEstimateDto; projectId?: string }>(response);
}

function RequestSummary({ estimate }: { estimate: CostEstimateDto }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Fact label="Preferred start" value={dateOrDash(estimate.preferredStartDate)} />
      <Fact label="Needed by" value={dateOrDash(estimate.neededBy)} />
      <Fact label="Submitted" value={dateOrDash(estimate.createdAt)} />
      <Fact label="Site address" value={estimate.siteAddress || "—"} />
    </dl>
  );
}

function BoqTable({ estimate }: { estimate: CostEstimateDto }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <tr>
            <th scope="col" className="px-3 py-2.5">Item</th>
            <th scope="col" className="px-3 py-2.5">Description</th>
            <th scope="col" className="px-3 py-2.5">Unit</th>
            <th scope="col" className="px-3 py-2.5 text-right">Qty</th>
            <th scope="col" className="px-3 py-2.5 text-right">Unit price</th>
            <th scope="col" className="px-3 py-2.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-200">
          {estimate.lineItems.map((line) => (
            <tr key={line.id}>
              <td className="px-3 py-2.5 align-top font-semibold text-stone-950">{line.item}</td>
              <td className="max-w-xs px-3 py-2.5 align-top text-stone-600">{line.description || "—"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 align-top text-stone-600">{line.unit}</td>
              <td className="px-3 py-2.5 text-right align-top tabular-nums">{line.quantity.toLocaleString("en-PH")}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums">{formatPeso(line.unitPrice)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums">{formatPeso(line.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-stone-200 text-sm">
          <tr><td colSpan={5} className="px-3 py-2 text-right text-stone-600">Subtotal</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatPeso(estimate.subtotal)}</td></tr>
          <tr><td colSpan={5} className="px-3 py-2 text-right text-stone-600">VAT ({Math.round(estimate.vatRate * 100)}%)</td><td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatPeso(estimate.vat)}</td></tr>
          <tr className="bg-rose-50"><td colSpan={5} className="px-3 py-3 text-right font-semibold text-stone-950">Contract total</td><td className="whitespace-nowrap px-3 py-3 text-right text-base font-semibold tabular-nums text-red-700">{formatPeso(estimate.total)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

function ReviewSection({ estimate, onChanged }: { estimate: CostEstimateDto; onChanged: (message?: string) => void }) {
  const minPercent = Math.max(MIN_DOWNPAYMENT_PERCENT, estimate.scheduleTemplate[0]?.percentage ?? 0);
  const [percentText, setPercentText] = useState(String(minPercent));
  const [dialog, setDialog] = useState<"accept" | "revise" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [percentTouched, setPercentTouched] = useState(false);
  const [reasonTouched, setReasonTouched] = useState(false);
  const percentRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const percent = percentText.trim() === "" ? NaN : Number(percentText);
  const percentError =
    numberError(percentText, { label: "Downpayment", max: 100, maxDecimals: 2, unit: "%" }) ??
    (percent < minPercent ? `Your downpayment must be at least ${minPercent}% of the contract total.` : null);
  const shownPercentError = percentTouched ? percentError : null;
  const schedule = useMemo(
    () => buildPaymentSchedule(estimate.total, estimate.scheduleTemplate, percentError ? minPercent : percent),
    [estimate.total, estimate.scheduleTemplate, percent, percentError, minPercent],
  );
  const downpayment = schedule[0]?.amount ?? 0;

  async function run(action: EstimateAction, message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendAction(estimate.id, action);
      setDialog(null);
      onChanged(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to update this estimate.");
    } finally {
      setBusy(false);
    }
  }

  const reasonError = textError(reason, { label: "Reason for revision", min: 5, max: 1000 });
  const shownReasonError = reasonTouched ? reasonError : null;

  function openAccept() {
    setError(null);
    if (percentError) {
      setPercentTouched(true);
      percentRef.current?.focus();
      return;
    }
    setDialog("accept");
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold tracking-tight">Bill of quantities</h3>
        <p className="mt-1 text-sm text-stone-600">Every cost line for building your house, with 12% VAT on top.</p>
        <div className="mt-3"><BoqTable estimate={estimate} /></div>
      </div>

      {estimate.adminNotes && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500"><MessageSquareText className="h-4 w-4" />Notes from G4 Builders</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{estimate.adminNotes}</p>
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold tracking-tight">Payment schedule</h3>
        <p className="mt-1 text-sm text-stone-600">You pay in stages as construction progresses. Choose how much to pay as your downpayment. A larger downpayment lowers the later stages.</p>
        <div className="mt-4 grid gap-4 rounded-xl bg-gradient-to-r from-red-950 to-red-800 p-5 text-white sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] sm:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-200">Your downpayment</p>
            <p className="mt-2 break-words text-3xl font-semibold tracking-tight">{formatPeso(downpayment)}</p>
            <p className="mt-1 text-xs text-rose-100">{percentError ? "Fix the percentage to see your amount." : `${Number.isInteger(percent) ? percent : percent.toFixed(2)}% of the ${formatPeso(estimate.total)} contract total`}</p>
          </div>
          <label className="block min-w-0 text-sm font-medium text-rose-100">
            Downpayment %
            <input
              type="number" inputMode="decimal" min={minPercent} max={100} step={0.01}
              ref={percentRef} id="estimate-downpayment-percent"
              value={percentText} onChange={(event) => setPercentText(event.target.value)}
              onBlur={() => setPercentTouched(true)}
              aria-invalid={shownPercentError ? true : undefined}
              aria-describedby={shownPercentError ? "estimate-downpayment-percent-error" : undefined}
              className="mt-2 min-h-11 w-full rounded-lg border border-rose-200 bg-white px-3 py-2.5 text-base text-stone-950 outline-none focus:ring-2 focus:ring-rose-300 sm:text-sm"
            />
          </label>
        </div>
        {shownPercentError
          ? <FieldError id="estimate-downpayment-percent-error" message={shownPercentError} />
          : <p className="mt-2 text-xs text-stone-500">{`Minimum downpayment is ${minPercent}%.`}</p>}
        <div className="mt-3"><ScheduleTable rows={schedule} /></div>
      </div>

      <div className="flex flex-col gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:justify-end">
        <Button variant="outline" className="min-h-11" onClick={() => { setError(null); setReason(""); setReasonTouched(false); setDialog("revise"); }}>Request revision</Button>
        <Button className="min-h-11" onClick={openAccept}><ClipboardCheck className="mr-2 h-4 w-4" />Accept estimate</Button>
      </div>

      {dialog === "accept" && (
        <BillingDialog title="Accept this estimate?" busy={busy} onClose={() => setDialog(null)}>
          <div className="space-y-4 text-sm leading-6 text-stone-600">
            <p>You are accepting estimate <span className="font-semibold text-stone-950">{estimate.reference}</span> for a contract total of <span className="font-semibold text-stone-950">{formatPeso(estimate.total)}</span> (VAT included).</p>
            <div className="rounded-lg bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Downpayment due</p>
              <p className="mt-1 text-2xl font-semibold text-red-700">{formatPeso(downpayment)}</p>
              <p className="mt-1 text-xs text-stone-600">{percent}% of the contract total</p>
            </div>
            <p>The Billing Clerk will issue your downpayment invoice. Construction is scheduled once that payment is verified.</p>
            <BillingErrorMessage message={error} />
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Go back</Button>
              <Button className="min-h-11" disabled={busy} onClick={() => void run({ action: "accept", downpaymentPercent: percent }, "Estimate accepted. Your project is created and the Billing Clerk will issue your downpayment invoice.")}>{busy ? "Accepting…" : "Confirm and accept"}</Button>
            </div>
          </div>
        </BillingDialog>
      )}

      {dialog === "revise" && (
        <BillingDialog title="Request a revision" busy={busy} onClose={() => setDialog(null)}>
          <form noValidate className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reasonError) { setReasonTouched(true); reasonRef.current?.focus(); return; } void run({ action: "request-revision", reason: reason.trim() }, "Revision requested. G4 Builders will send you an updated estimate."); }}>
            <p className="text-sm leading-6 text-stone-600">Tell G4 Builders what to change, such as scope, materials, or the payment schedule. We will send you an updated estimate.</p>
            <label className={constructionLabelClass}>
              Reason for revision <RequiredIndicator />
              <textarea
                required maxLength={1000} rows={5} value={reason} autoFocus
                ref={reasonRef} id="estimate-revision-reason"
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => setReasonTouched(true)}
                aria-invalid={shownReasonError ? true : undefined}
                aria-describedby={shownReasonError ? "estimate-revision-reason-error" : undefined}
                placeholder="Example: Please use a lower-cost roofing material."
                className={`${constructionFieldClass} aria-invalid:border-red-600`}
              />
              {shownReasonError
                ? <FieldError id="estimate-revision-reason-error" message={shownReasonError} />
                : <span className="mt-1 block text-xs font-normal text-stone-500">At least 5 characters.</span>}
            </label>
            <BillingErrorMessage message={error} />
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" className="min-h-11" disabled={busy}>{busy ? "Sending…" : "Send revision request"}</Button>
            </div>
          </form>
        </BillingDialog>
      )}
    </div>
  );
}

export function ConstructionEstimateCard({ estimate, highlighted, onChanged }: {
  estimate: CostEstimateDto;
  highlighted: boolean;
  onChanged: (message?: string) => void;
}) {
  const preparing = estimate.status === "Requested" || estimate.status === "Draft";
  return (
    <div id={`estimate-${estimate.id}`} className="scroll-mt-28">
      <BillingPanel className={highlighted ? "border-red-300 ring-2 ring-red-600/20" : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>{`Estimate ${estimate.reference}`}</Eyebrow>
            <h2 className="mt-1 break-words text-xl font-semibold tracking-tight">{estimate.designLabel}</h2>
            {(estimate.floorArea || estimate.finish) && (
              <p className="mt-1 text-sm text-stone-600">{[estimate.floorArea ? `${estimate.floorArea} sqm` : null, estimate.finish].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <span className="inline-flex whitespace-nowrap rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-red-800">
            {preparing ? "Preparing estimate" : estimate.status === "Sent" ? "Ready for your review" : estimate.status}
          </span>
        </div>

        <div className="mt-5 space-y-5">
          {preparing && (
            <>
              <div className="flex items-start gap-3 rounded-lg bg-stone-50 p-4">
                <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                <div><p className="text-sm font-semibold">G4 Builders is preparing your cost estimate</p><p className="mt-1 text-sm leading-6 text-stone-600">Our team is pricing your build and setting your payment schedule. You will be notified as soon as it is ready for your review.</p></div>
              </div>
              <RequestSummary estimate={estimate} />
              {estimate.customerNotes && <p className="whitespace-pre-wrap break-words rounded-lg border border-stone-200 p-4 text-sm leading-6 text-stone-600"><span className="block text-xs font-semibold uppercase tracking-wide text-stone-500">Your notes</span>{estimate.customerNotes}</p>}
            </>
          )}

          {estimate.status === "Revision requested" && (
            <>
              <div className="flex items-start gap-3 rounded-lg bg-stone-50 p-4">
                <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                <div className="min-w-0"><p className="text-sm font-semibold">Waiting for the revised estimate</p><p className="mt-1 text-sm leading-6 text-stone-600">G4 Builders received your revision request and will send an updated estimate.</p></div>
              </div>
              {estimate.revisionNote && <p className="whitespace-pre-wrap break-words rounded-lg border border-stone-200 p-4 text-sm leading-6 text-stone-600"><span className="block text-xs font-semibold uppercase tracking-wide text-stone-500">Your revision request</span>{estimate.revisionNote}</p>}
              <RequestSummary estimate={estimate} />
            </>
          )}

          {estimate.status === "Sent" && (
            <>
              <RequestSummary estimate={estimate} />
              <ReviewSection estimate={estimate} onChanged={onChanged} />
            </>
          )}

          {estimate.status === "Accepted" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-rose-50 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-900">Estimate accepted {estimate.acceptedAt ? dateOrDash(estimate.acceptedAt) : ""}</p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">Contract total {formatPeso(estimate.total)}{estimate.downpaymentPercent ? ` · ${estimate.downpaymentPercent}% downpayment` : ""}.</p>
                </div>
              </div>
              {estimate.projectId && <Button asChild variant="outline"><a href={`#project-${estimate.projectId}`}>View project</a></Button>}
            </div>
          )}
        </div>
      </BillingPanel>
    </div>
  );
}
