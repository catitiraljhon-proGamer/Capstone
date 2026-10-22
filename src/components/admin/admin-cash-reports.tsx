"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingBadge, billingDate, billingJson } from "@/components/billing/billing-primitives";
import { CashReportVerifyDialog, differenceText } from "@/components/billing/cash-reports";
import { formatPeso } from "@/lib/house-design-data";
import type { CashReport } from "@/types/billing";

/** The Billing Clerk's daily cash reports on the Admin's Approvals page: verify each when the cash is handed over. */
export function AdminCashReports() {
  const [reports, setReports] = useState<CashReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selected, setSelected] = useState<CashReport | null>(null);
  const load = useCallback((signal?: AbortSignal) => fetch("/api/billing/cash-reports", { cache: "no-store", signal })
    .then((response) => billingJson<{ reports: CashReport[] }>(response))
    .then(({ reports }) => { if (!signal?.aborted) { setReports(reports); setError(null); } })
    .catch((reason: unknown) => { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Unable to load daily cash reports."); })
    .finally(() => { if (!signal?.aborted) setLoading(false); }), []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const pending = reports.filter((report) => report.status === "Pending").length;

  return <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Banknote className="h-5 w-5 text-red-700" aria-hidden="true" />Daily Cash Reports</h2>
        <p className="mt-1 text-sm text-stone-600">Verify each report when the Billing Clerk hands over the counted cash.</p>
      </div>
      {!loading && !error && <p className="text-sm text-stone-600"><strong className="text-stone-950">{pending}</strong> waiting for verification</p>}
    </div>
    {error && <p role="alert" className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="m-5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">{success}</p>}
    {loading ? <div className="flex items-center justify-center gap-3 p-10 text-sm text-stone-500"><LoaderCircle className="h-5 w-5 animate-spin text-red-700" />Loading daily cash reports…</div>
      : !reports.length ? !error && <p className="p-5 text-sm text-stone-600">No daily cash reports yet. The Billing Clerk submits one after counting the cash at the end of the day.</p>
      : <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs font-semibold uppercase tracking-wide text-stone-500"><tr>
            {["Report", "Billing Clerk", "Expected", "Counted", "Submitted", "Status", ""].map((heading, index) => <th key={heading || index} className={`border-b border-stone-200 px-5 py-3 ${["Expected", "Counted"].includes(heading) ? "text-right" : ""}`}>{heading}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-stone-200">{reports.map((report) => <tr key={report.id}>
            <td className="px-5 py-3.5"><p className="font-semibold">{report.reference}</p><p className="text-xs text-stone-500">{billingDate(report.businessDate)}</p></td>
            <td className="px-5 py-3.5">{report.clerkName}</td>
            <td className="px-5 py-3.5 text-right tabular-nums">{formatPeso(report.expected)}</td>
            <td className="px-5 py-3.5 text-right tabular-nums">{formatPeso(report.counted)}<span className={`block text-xs ${report.difference ? "font-semibold text-red-700" : "text-stone-500"}`}>{differenceText(report.difference)}</span></td>
            <td className="whitespace-nowrap px-5 py-3.5 text-stone-600">{billingDate(report.submittedAt)}</td>
            <td className="px-5 py-3.5"><BillingBadge status={report.status} /></td>
            <td className="px-5 py-3.5 text-right"><Button size="sm" variant={report.status === "Pending" ? "default" : "outline"} onClick={() => { setSuccess(null); setSelected(report); }}>{report.status === "Pending" ? "Verify" : "View"}</Button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    {selected && <CashReportVerifyDialog report={selected} onClose={() => setSelected(null)} onVerified={async () => {
      setSuccess(`${selected.reference} was verified and the day is closed.`);
      await load();
    }} />}
  </section>;
}
