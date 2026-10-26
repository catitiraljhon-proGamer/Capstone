"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, CheckCircle2, ChevronRight, ClipboardCheck, Hourglass, MessageSquareText, X } from "lucide-react";
import { BillingDialog, BillingErrorMessage, BillingPanel, billingJson } from "@/components/billing/billing-primitives";
import { constructionFieldClass, constructionLabelClass, dateOrDash, Eyebrow, Fact, ScheduleTable } from "@/components/customer/construction-shared";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { buildPaymentSchedule, MIN_DOWNPAYMENT_PERCENT } from "@/lib/construction";
import { numberError, textError } from "@/lib/form-validation";
import { formatPeso } from "@/lib/house-design-data";
import { materialNameKey, materialNameMax } from "@/lib/materials";
import type { CostEstimateDto, EstimateAction, EstimateRevisionChange } from "@/types/construction";

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
      <Fact label="Preferred Start" value={dateOrDash(estimate.preferredStartDate)} />
      <Fact label="Needed by" value={dateOrDash(estimate.neededBy)} />
      <Fact label="Submitted" value={dateOrDash(estimate.createdAt)} />
      <Fact label="Site Address" value={estimate.siteAddress || "—"} />
    </dl>
  );
}

/** A material the customer wants swapped; `lineId` and `materialLineId` point at it in the sent estimate. */
type MaterialRequest = EstimateRevisionChange & { lineId: string; materialLineId: string };

function changeRequestError(text: string, current: string) {
  const value = text.trim();
  if (!value) return "Enter the material you want.";
  if (value.length < 2) return "Material name must be at least 2 characters.";
  if (materialNameKey(value) === materialNameKey(current)) return "Enter a different material.";
  return null;
}

/** Material names to suggest; prices are never sent to customers. */
function useMaterialNames(enabled: boolean) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch("/api/catalog/materials", { cache: "no-store" })
      .then(async (response) => ((await response.json().catch(() => ({}))) as { names?: string[] }).names ?? [])
      .then((list) => { if (active) setNames(list); })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);
  return names;
}

/**
 * Each scope with its quantity, unit, and amount. Scopes with materials open to list the material names only; the
 * prices and quantities stay with G4 Builders. With `onRequestsChange`, each material can be asked to change.
 */
function ScopeOfWorksTable({ estimate, requests = [], onRequestsChange }: {
  estimate: CostEstimateDto;
  requests?: MaterialRequest[];
  onRequestsChange?: (requests: MaterialRequest[]) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(estimate.lineItems[0]?.materials?.length ? [estimate.lineItems[0].id] : []));
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [tried, setTried] = useState(false);
  const names = useMaterialNames(Boolean(onRequestsChange));
  const listId = useId();

  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const startChange = (materialLineId: string) => {
    setEditing(materialLineId);
    setDraft("");
    setTried(false);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <tr>
            <th scope="col" className="px-3 py-2.5">Scope of Works</th>
            <th scope="col" className="w-16 px-3 py-2.5 text-right">Qty</th>
            <th scope="col" className="w-20 px-3 py-2.5">Unit</th>
            <th scope="col" className="w-36 px-3 py-2.5 text-right">Amount</th>
          </tr>
        </thead>
        {estimate.lineItems.map((line) => {
          const materials = line.materials ?? [];
          const isOpen = open.has(line.id);
          const name = line.description ? `${line.item} – ${line.description}` : line.item;
          return (
            <tbody key={line.id} className="border-t border-stone-200">
              <tr>
                <td className="px-3 py-2.5 align-top font-semibold text-stone-950">
                  {materials.length ? (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`scope-${line.id}`}
                      onClick={() => toggle(line.id)}
                      className="inline-flex min-h-6 items-center gap-2 text-left font-semibold hover:text-red-800"
                    >
                      <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 text-red-700 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      {name}
                    </button>
                  ) : <span className="pl-6">{name}</span>}
                </td>
                <td className="px-3 py-2.5 text-right align-top tabular-nums">{line.quantity}</td>
                <td className="px-3 py-2.5 align-top">{line.unit}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums">{formatPeso(line.amount)}</td>
              </tr>
              {isOpen ? (
                <tr id={`scope-${line.id}`}>
                  <td colSpan={4} className="px-3 pb-3 sm:pl-9">
                    <div className="rounded-lg border border-stone-200 bg-stone-50 px-3">
                      <p className="border-b border-stone-200 pb-2 pt-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500">Material</p>
                      <ul aria-label={`Materials in ${line.item}`} className="divide-y divide-stone-200/70">
                        {materials.map((material) => {
                          const request = requests.find((item) => item.materialLineId === material.id);
                          const isEditing = editing === material.id;
                          const error = isEditing ? changeRequestError(draft, material.name) : null;
                          const inputId = `change-${material.id}`;
                          return (
                            <li key={material.id} className="py-2.5">
                              <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
                                <span className="text-stone-950">
                                  {material.name}
                                  {request ? <> <span className="text-stone-500">→</span> <strong className="text-red-800">{request.wants}</strong></> : null}
                                </span>
                                {onRequestsChange ? (
                                  <span className="flex items-center gap-2">
                                    {request ? (
                                      <>
                                        <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-red-800">Change requested</span>
                                        <Button type="button" variant="outline" size="sm" aria-label={`Undo the change to ${material.name}`} onClick={() => onRequestsChange(requests.filter((item) => item !== request))}>Undo</Button>
                                      </>
                                    ) : !isEditing ? (
                                      <Button type="button" variant="outline" size="sm" className="text-red-700" aria-label={`Request a change to ${material.name}`} onClick={() => startChange(material.id)}>
                                        <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Request change
                                      </Button>
                                    ) : null}
                                  </span>
                                ) : null}
                              </div>
                              {isEditing && onRequestsChange ? (
                                <form
                                  noValidate
                                  className="mt-2.5 rounded-lg border border-stone-200 bg-white p-3"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    if (error) {
                                      setTried(true);
                                      return;
                                    }
                                    onRequestsChange([...requests, {
                                      lineId: line.id, materialLineId: material.id, scope: line.item, material: material.name, wants: draft.trim(),
                                    }]);
                                    setEditing(null);
                                  }}
                                >
                                  <label htmlFor={inputId} className={constructionLabelClass}>Change {material.name} to <RequiredIndicator /></label>
                                  <input
                                    id={inputId}
                                    list={listId}
                                    maxLength={materialNameMax}
                                    autoFocus
                                    placeholder="Enter material name"
                                    className={`${constructionFieldClass} max-w-md aria-invalid:border-red-600`}
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    aria-invalid={tried && error ? true : undefined}
                                    aria-describedby={tried && error ? `${inputId}-error` : `${inputId}-hint`}
                                  />
                                  {tried && error
                                    ? <FieldError id={`${inputId}-error`} message={error} />
                                    : <p id={`${inputId}-hint`} className="mt-1 text-xs text-stone-500">Type any material. It doesn&apos;t have to be on the list.</p>}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Button type="submit" size="sm" className="min-h-10">Add to Request</Button>
                                    <Button type="button" variant="outline" size="sm" className="min-h-10" onClick={() => setEditing(null)}>Cancel</Button>
                                  </div>
                                </form>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          );
        })}
        <tfoot className="border-t border-stone-200 text-sm">
          <tr className="bg-rose-50"><td colSpan={3} className="px-3 py-3 text-right font-semibold text-stone-950">Contract Total</td><td className="whitespace-nowrap px-3 py-3 text-right text-base font-semibold tabular-nums text-red-700">{formatPeso(estimate.total)}</td></tr>
        </tfoot>
      </table>
      {onRequestsChange ? <datalist id={listId}>{names.map((option) => <option key={option} value={option} />)}</datalist> : null}
    </div>
  );
}

/** The materials the customer asked to change, as listed in their revision request. */
function RequestedChanges({ changes }: { changes: EstimateRevisionChange[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {changes.map((change, index) => (
        <li key={index} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-stone-700">
          <span className="text-stone-500">{change.scope}:</span> {change.material} → <strong className="text-red-800">{change.wants}</strong>
        </li>
      ))}
    </ul>
  );
}

function ReviewSection({ estimate, onChanged }: { estimate: CostEstimateDto; onChanged: (message?: string) => void }) {
  const minPercent = Math.max(MIN_DOWNPAYMENT_PERCENT, estimate.scheduleTemplate[0]?.percentage ?? 0);
  const [percentText, setPercentText] = useState(String(minPercent));
  const [dialog, setDialog] = useState<"accept" | "revise" | null>(null);
  const [reason, setReason] = useState("");
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [otherChanges, setOtherChanges] = useState("");
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
        <h3 className="text-base font-semibold tracking-tight">Scope of Works</h3>
        <p className="mt-1 text-sm text-stone-600">
          Each scope of work for building your house and its amount. Open one to see the materials it includes, and ask for a different material if you want one.
        </p>
        <div className="mt-3">
          <ScopeOfWorksTable estimate={estimate} requests={requests} onRequestsChange={(next) => { setRequests(next); setError(null); }} />
        </div>
        {requests.length ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-red-900">Your revision request</p>
            <p className="mt-1 text-sm text-stone-600">G4 Builders will update these materials and send you a new estimate. The amounts may change.</p>
            <ul className="mt-3 space-y-1.5">
              {requests.map((request) => (
                <li key={request.materialLineId} className="flex items-center gap-2 rounded-lg border border-rose-200 bg-white py-1.5 pl-3 pr-1.5 text-sm">
                  <span className="min-w-0 flex-1 text-stone-700">
                    <span className="text-stone-500">{request.scope}:</span> {request.material} → <strong className="text-red-800">{request.wants}</strong>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove the change to ${request.material}`}
                    onClick={() => setRequests(requests.filter((item) => item !== request))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <label className={`${constructionLabelClass} mt-4`} htmlFor="estimate-other-changes">Other changes (optional)</label>
            <textarea
              id="estimate-other-changes"
              rows={3}
              maxLength={1000}
              placeholder="Enter other changes"
              className={constructionFieldClass}
              value={otherChanges}
              onChange={(event) => setOtherChanges(event.target.value)}
            />
            {dialog === null ? <BillingErrorMessage message={error} /> : null}
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                className="min-h-11"
                disabled={busy}
                onClick={() => void run({
                  action: "request-revision",
                  reason: otherChanges.trim(),
                  changes: requests.map(({ lineId, materialLineId, wants }) => ({ lineId, materialLineId, wants })),
                }, "Revision requested. G4 Builders will update the materials and send you a new estimate.")}
              >
                {busy ? "Sending…" : "Send Revision Request"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {estimate.adminNotes && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500"><MessageSquareText className="h-4 w-4" />Notes from G4 Builders</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{estimate.adminNotes}</p>
        </div>
      )}

      <div>
        <h3 className="text-base font-semibold tracking-tight">Payment Schedule</h3>
        <p className="mt-1 text-sm text-stone-600">You pay in stages as construction progresses. Choose how much to pay as your downpayment. A larger downpayment lowers the later stages.</p>
        <div className="mt-4 grid gap-4 rounded-xl bg-gradient-to-r from-red-950 to-red-800 p-5 text-white sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] sm:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-200">Your Downpayment</p>
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

      {requests.length ? (
        <p className="border-t border-stone-200 pt-5 text-right text-sm text-stone-600">Send or remove your requested changes before accepting this estimate.</p>
      ) : (
        <div className="flex flex-col gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => { setError(null); setReason(""); setReasonTouched(false); setDialog("revise"); }}>Request revision</Button>
          <Button className="min-h-11" onClick={openAccept}><ClipboardCheck className="mr-2 h-4 w-4" />Accept Estimate</Button>
        </div>
      )}

      {dialog === "accept" && (
        <BillingDialog title="Accept this estimate?" busy={busy} onClose={() => setDialog(null)}>
          <div className="space-y-4 text-sm leading-6 text-stone-600">
            <p>You are accepting estimate <span className="font-semibold text-stone-950">{estimate.reference}</span> for a contract total of <span className="font-semibold text-stone-950">{formatPeso(estimate.total)}</span>.</p>
            <div className="rounded-lg bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Downpayment Due</p>
              <p className="mt-1 text-2xl font-semibold text-red-700">{formatPeso(downpayment)}</p>
              <p className="mt-1 text-xs text-stone-600">{percent}% of the contract total</p>
            </div>
            <p>Your downpayment invoice is issued automatically, so you can pay it in Billing right after you accept. Construction is scheduled once that payment is verified.</p>
            <BillingErrorMessage message={error} />
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Go Back</Button>
              <Button className="min-h-11" disabled={busy} onClick={() => void run({ action: "accept", downpaymentPercent: percent }, "Estimate accepted. Your project is created and your downpayment invoice is ready in Billing.")}>{busy ? "Accepting…" : "Confirm and Accept"}</Button>
            </div>
          </div>
        </BillingDialog>
      )}

      {dialog === "revise" && (
        <BillingDialog title="Request a Revision" busy={busy} onClose={() => setDialog(null)}>
          <form noValidate className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (reasonError) { setReasonTouched(true); reasonRef.current?.focus(); return; } void run({ action: "request-revision", reason: reason.trim() }, "Revision requested. G4 Builders will send you an updated estimate."); }}>
            <p className="text-sm leading-6 text-stone-600">Tell G4 Builders what to change, such as scope, materials, or the payment schedule. We will send you an updated estimate.</p>
            <label className={constructionLabelClass}>
              Reason for Revision <RequiredIndicator />
              <textarea
                required maxLength={1000} rows={5} value={reason} autoFocus
                ref={reasonRef} id="estimate-revision-reason"
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => setReasonTouched(true)}
                aria-invalid={shownReasonError ? true : undefined}
                aria-describedby={shownReasonError ? "estimate-revision-reason-error" : undefined}
                placeholder="Enter reason for revision"
                className={`${constructionFieldClass} aria-invalid:border-red-600`}
              />
              {shownReasonError
                ? <FieldError id="estimate-revision-reason-error" message={shownReasonError} />
                : <span className="mt-1 block text-xs font-normal text-stone-500">At least 5 characters.</span>}
            </label>
            <BillingErrorMessage message={error} />
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" className="min-h-11" disabled={busy}>{busy ? "Sending…" : "Send Revision Request"}</Button>
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
            {estimate.floorArea || estimate.finish ? (
              <p className="mt-1 text-sm text-stone-600">
                {[estimate.floorArea ? `${estimate.floorArea} sqm` : null, estimate.finish ? `${estimate.finish} finish` : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}
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
              {estimate.customerNotes && <p className="whitespace-pre-wrap break-words rounded-lg border border-stone-200 p-4 text-sm leading-6 text-stone-600"><span className="block text-xs font-semibold uppercase tracking-wide text-stone-500">Your Notes</span>{estimate.customerNotes}</p>}
            </>
          )}

          {estimate.status === "Revision requested" && (
            <>
              <div className="flex items-start gap-3 rounded-lg bg-stone-50 p-4">
                <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                <div className="min-w-0"><p className="text-sm font-semibold">Waiting for the revised estimate</p><p className="mt-1 text-sm leading-6 text-stone-600">G4 Builders received your revision request and will send an updated estimate.</p></div>
              </div>
              {estimate.revisionNote || estimate.revisionChanges.length ? (
                <div className="rounded-lg border border-stone-200 p-4 text-sm leading-6 text-stone-600">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Your Revision Request</p>
                  {estimate.revisionChanges.length ? <RequestedChanges changes={estimate.revisionChanges} /> : null}
                  {estimate.revisionNote ? (
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {estimate.revisionChanges.length ? <span className="font-semibold text-stone-700">Other changes: </span> : null}
                      {estimate.revisionNote}
                    </p>
                  ) : null}
                </div>
              ) : null}
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
              {estimate.projectId && <Button asChild variant="outline"><a href={`#project-${estimate.projectId}`}>View Project</a></Button>}
            </div>
          )}
        </div>
      </BillingPanel>
    </div>
  );
}
