"use client";

import { useState, type FormEvent } from "react";
import { Banknote, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PesoInput } from "@/components/ui/peso-input";
import { BillingBadge, BillingDialog, BillingErrorMessage, BillingPanel, billingDate, billingFieldClass as field } from "@/components/billing/billing-primitives";
import { countLabel, useFieldMessages, type BillingMutation } from "@/components/billing/billing-forms";
import { amountError, textError } from "@/lib/form-validation";
import { formatPeso } from "@/lib/house-design-data";
import { fromCentavos, manilaDate, toCentavos } from "@/lib/billing";
import type { CashDrawer, CashReport, CashReportPayment } from "@/types/billing";

const invalidField = `${field} aria-invalid:border-red-600`;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to save this record.";
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

/** "Matches", "Short ₱200.00" or "Over ₱50.00" for counted minus expected cash. */
export function differenceText(difference: number) {
  if (difference === 0) return "Matches";
  return `${difference < 0 ? "Short" : "Over"} ${formatPeso(Math.abs(difference))}`;
}

/** Expected, counted and difference side by side, with the difference tinted red when the cash does not match. */
export function CashTotals({ expected, counted, expectedNote, countedNote }: { expected: number; counted: number | null; expectedNote: string; countedNote: string }) {
  const difference = counted === null ? null : fromCentavos(toCentavos(counted) - toCentavos(expected));
  const off = difference !== null && difference !== 0;
  return <div className="grid gap-3 sm:grid-cols-3">
    <div className="rounded-lg border border-stone-200 p-3.5"><p className="text-xs text-stone-500">Expected cash</p><p className="mt-1.5 text-xl font-semibold tracking-tight">{formatPeso(expected)}</p><p className="mt-1 text-xs text-stone-500">{expectedNote}</p></div>
    <div className="rounded-lg border border-stone-200 p-3.5"><p className="text-xs text-stone-500">Counted</p><p className="mt-1.5 text-xl font-semibold tracking-tight">{counted === null ? "—" : formatPeso(counted)}</p><p className="mt-1 text-xs text-stone-500">{countedNote}</p></div>
    <div className={`rounded-lg border p-3.5 ${off ? "border-red-200 bg-red-50 text-red-800" : "border-stone-200"}`}><p className={`text-xs ${off ? "text-red-800" : "text-stone-500"}`}>Difference</p><p className="mt-1.5 text-xl font-semibold tracking-tight">{difference === null ? "—" : difference === 0 ? formatPeso(0) : `${difference < 0 ? "−" : "+"}${formatPeso(Math.abs(difference))}`}</p><p className="mt-1 text-xs font-semibold">{difference === null ? "" : differenceText(difference)}</p></div>
  </div>;
}

/** The cash payments a total covers; void cash stays listed with its reason but is not expected in the drawer. */
export function CashPaymentList({ payments }: { payments: CashReportPayment[] }) {
  return <div className="overflow-x-auto rounded-lg border border-stone-200">
    <table className="w-full min-w-[32rem] text-left text-sm">
      <thead className="bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500"><tr><th className="px-3.5 py-2.5">Receipt</th><th className="px-3.5 py-2.5">Time</th><th className="px-3.5 py-2.5">Customer · invoice</th><th className="px-3.5 py-2.5 text-right">Amount</th></tr></thead>
      <tbody className="divide-y divide-stone-100">{payments.map((payment) => {
        const isVoid = payment.status === "Reversed";
        return <tr key={payment.id} className={isVoid ? "bg-stone-50 text-stone-500" : ""}>
          <td className="px-3.5 py-2.5 font-semibold">{payment.receiptNumber ?? payment.reference}{isVoid && <span className="ml-2 align-middle"><BillingBadge status="Reversed" /></span>}</td>
          <td className="whitespace-nowrap px-3.5 py-2.5">{billingDate(payment.paidAt)} · {timeOf(payment.paidAt)}</td>
          <td className="px-3.5 py-2.5">{payment.customerName}<span className="block text-xs text-stone-500">{isVoid && payment.reversalReason ? `Void reason: ${payment.reversalReason}` : payment.invoiceNumber}</span></td>
          <td className={`px-3.5 py-2.5 text-right tabular-nums ${isVoid ? "line-through" : ""}`}>{formatPeso(payment.amount)}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

/**
 * The Billing Clerk's end-of-day count: one counted total against the expected cash. The total is locked once
 * submitted, and a difference needs an explanation for the Admin.
 */
function CashTotalDialog({ drawer, mutate, onClose }: { drawer: CashDrawer; mutate: BillingMutation; onClose: () => void }) {
  const [counted, setCounted] = useState("");
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldMessages();
  const countedMessage = amountError(counted, { label: "Total cash counted", allowZero: true });
  const countedValue = countedMessage ? null : Number(counted);
  const balanced = countedValue !== null && toCentavos(countedValue) === toCentavos(drawer.expected);
  const messages = {
    counted: countedMessage,
    explanation: countedValue === null || balanced ? null : textError(explanation, { label: "Explanation", min: 5, max: 1000 }),
  };
  const voided = drawer.payments.filter((payment) => payment.status === "Reversed").length;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fields.blocked(messages) || countedValue === null) return;
    setBusy(true); setError(null);
    try {
      await mutate("/api/billing/cash-reports", "POST", {
        paymentIds: drawer.payments.map((payment) => payment.id), expected: drawer.expected, counted: countedValue,
        ...(balanced ? {} : { explanation }),
      });
      onClose();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <BillingDialog title={`Enter Cash Total · ${billingDate(manilaDate())}`} onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate className="space-y-4">
      <BillingErrorMessage message={error} />
      <CashPaymentList payments={drawer.payments} />
      <CashTotals expected={drawer.expected} counted={countedValue} expectedNote={`${countLabel(drawer.payments.length - voided, "cash payment")}${voided ? `, ${voided} void not included` : ""}`} countedNote="The cash in your drawer" />
      <div><label className="text-sm font-medium">Total cash counted (PHP)<PesoInput required autoFocus min="0" step="0.01" value={counted} wrapperClassName="mt-1.5" {...fields.props("counted", messages.counted)} onChange={(event) => setCounted(event.target.value)} /></label>{fields.error("counted", messages.counted)}</div>
      {countedValue !== null && !balanced && <div><label className="block text-sm font-medium">Explain the difference<textarea required rows={3} maxLength={1000} className={invalidField} {...fields.props("explanation", messages.explanation)} value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>{fields.error("explanation", messages.explanation)}<p className="mt-1.5 text-xs text-stone-500">The Admin reads this before verifying the cash.</p></div>}
      <p className="flex items-start gap-2 text-sm leading-6 text-stone-600"><Lock className="mt-1 h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" /><span>You can&apos;t change the total after you submit. Hand the counted cash to the Admin for verification.</span></p>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Submitting…" : "Submit for Verification"}</Button></div>
    </form>
  </BillingDialog>;
}

/** The Billing Clerk's cash on the Payments page: what to count now, and the recent daily cash reports. */
export function CashDrawerPanel({ drawer, reports, mutate }: { drawer: CashDrawer; reports: CashReport[]; mutate: BillingMutation }) {
  const [counting, setCounting] = useState(false);
  const today = manilaDate();
  const fromEarlierDays = drawer.payments.some((payment) => manilaDate(new Date(payment.paidAt)) < today);
  const verifiedCount = drawer.payments.filter((payment) => payment.status === "Verified").length;
  return <BillingPanel>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-80">
        <h2 className="text-lg font-semibold tracking-tight">{fromEarlierDays ? "Cash Not Yet Counted" : `Today's Cash · ${billingDate(today)}`}</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">{drawer.payments.length
          ? <>{countLabel(verifiedCount, "cash payment")}, <strong className="text-stone-950">{formatPeso(drawer.expected)}</strong> expected{fromEarlierDays ? ", including cash from earlier days" : ""}. When the office closes, count the drawer, enter the total, and hand the cash to the Admin.</>
          : "No cash to count. Cash you record appears here until you enter the total for the day."}</p>
      </div>
      <Button disabled={!drawer.payments.length} onClick={() => setCounting(true)}><Banknote className="mr-2 h-4 w-4" />Enter Cash Total</Button>
    </div>
    {reports.length > 0 && <div className="mt-5 overflow-x-auto rounded-lg border border-stone-200">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="text-xs font-semibold uppercase tracking-wide text-stone-500"><tr className="border-b border-stone-200"><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Report</th><th className="px-4 py-2.5 text-right">Expected</th><th className="px-4 py-2.5 text-right">Counted</th><th className="px-4 py-2.5">Status</th></tr></thead>
        <tbody className="divide-y divide-stone-100">{reports.map((report) => <tr key={report.id}>
          <td className="whitespace-nowrap px-4 py-3 font-semibold">{billingDate(report.businessDate)}</td>
          <td className="px-4 py-3 text-stone-600">{report.reference}</td>
          <td className="px-4 py-3 text-right tabular-nums">{formatPeso(report.expected)}</td>
          <td className="px-4 py-3 text-right tabular-nums">{formatPeso(report.counted)}<span className={`block text-xs ${report.difference ? "text-red-700" : "text-stone-500"}`}>{differenceText(report.difference)}</span></td>
          <td className="px-4 py-3">{report.status === "Pending" ? <span className="text-sm text-stone-600">Awaiting Admin verification</span> : <BillingBadge status="Verified" />}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {counting && <CashTotalDialog drawer={drawer} mutate={mutate} onClose={() => setCounting(false)} />}
  </BillingPanel>;
}

/** The Admin confirms receiving and counting the reported cash; a difference needs a note before the day closes. */
export function CashReportVerifyDialog({ report, onVerified, onClose }: { report: CashReport; onVerified: () => Promise<void>; onClose: () => void }) {
  const [received, setReceived] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldMessages();
  const pending = report.status === "Pending";
  const messages = {
    received: received ? null : "Tick the box to confirm you received and counted the cash.",
    note: report.difference === 0 ? null : textError(note, { label: "Note on the difference", min: 5, max: 1000 }),
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending || fields.blocked(messages)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/billing/cash-reports/${report.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ received: true, ...(note.trim() ? { note } : {}) }),
      });
      const payload = await response.json() as { error?: string; issues?: { message: string }[] };
      if (!response.ok) throw new Error(payload.issues?.[0]?.message ?? payload.error ?? "Unable to verify this report.");
      await onVerified();
      onClose();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  const verifiedCount = report.payments.filter((payment) => payment.status === "Verified").length;
  return <BillingDialog title={`${pending ? "Verify " : ""}Daily Cash Report · ${billingDate(report.businessDate)}`} onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate className="space-y-5">
      <BillingErrorMessage message={error} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-semibold">{report.clerkName} · Billing Clerk</p><p className="mt-1 text-sm text-stone-600">{report.reference} · submitted {billingDate(report.submittedAt)}, {timeOf(report.submittedAt)}</p></div>
        <BillingBadge status={report.status} />
      </div>
      <CashTotals expected={report.expected} counted={report.counted} expectedNote={countLabel(verifiedCount, "cash payment")} countedNote={pending ? "Handed to you" : "Counted by the clerk"} />
      {report.explanation && <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700"><strong className="text-stone-950">Clerk&apos;s explanation:</strong> {report.explanation}</p>}
      <div><h3 className="mb-2.5 text-sm font-semibold">Cash payments</h3><CashPaymentList payments={report.payments} /></div>
      {pending ? <>
        <div className="space-y-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <div><label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-white p-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-red-700" {...fields.props("received", messages.received)} checked={received} onChange={(event) => setReceived(event.target.checked)} /><span>I received {formatPeso(report.counted)} in cash from {report.clerkName} and counted it.</span></label>{fields.error("received", messages.received)}</div>
          {report.difference !== 0 && <div><label className="block text-sm font-medium">Note on the difference<textarea required rows={2} maxLength={1000} className={invalidField} {...fields.props("note", messages.note)} value={note} onChange={(event) => setNote(event.target.value)} /></label>{fields.error("note", messages.note)}<p className="mt-1.5 text-xs text-stone-500">Saved with the closed day.</p></div>}
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Verifying…" : "Verify & Close Day"}</Button></div>
      </> : <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">Verified by {report.verifiedByName} on {report.verifiedAt ? billingDate(report.verifiedAt) : "—"}.{report.adminNote ? ` Note: ${report.adminNote}` : ""}</p>}
    </form>
  </BillingDialog>;
}
