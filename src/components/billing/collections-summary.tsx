"use client";

import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SelectAllHeader, SelectRowCell } from "@/components/ui/row-selection";
import { manilaDate, sumMoney } from "@/lib/billing";
import { exportWorkbook, xlsxSheet, type XlsxColumn } from "@/lib/export-xlsx";
import { formatPeso } from "@/lib/house-design-data";
import type { CollectionsReport, CollectedEntry, InvoicedEntry } from "@/types/collections-report";
import { AlertTriangle, Banknote, Download, FileText, HandCoins, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type MonthRow = { id: string; month: string; invoiceCount: number; invoiced: number; paymentCount: number; collected: number };
type SummaryRow = { item: string; value: string | number };

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const field = "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-normal text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";
const head = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";
const headRight = head.replace("text-left", "text-right");
const cell = "px-4 py-4 align-top text-sm";
const money = `${cell} whitespace-nowrap text-right tabular-nums`;

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });

const monthColumns: XlsxColumn<MonthRow>[] = [
  { header: "Month", width: 18, format: "month", value: (row) => row.month },
  { header: "Invoices Issued", width: 16, value: (row) => row.invoiceCount },
  { header: "Invoiced", width: 17, format: "peso", value: (row) => row.invoiced },
  { header: "Verified Payments", width: 18, value: (row) => row.paymentCount },
  { header: "Collected", width: 17, format: "peso", value: (row) => row.collected },
];
const summaryColumns: XlsxColumn<SummaryRow>[] = [
  { header: "Collections Summary", width: 34, value: (row) => row.item },
  { header: "Details", width: 44, format: "peso", value: (row) => row.value },
];
const invoiceColumns: XlsxColumn<InvoicedEntry>[] = [
  { header: "Invoice", width: 18, value: (entry) => entry.invoiceNumber },
  { header: "Issued", width: 14, format: "date", value: (entry) => entry.issuedOn },
  { header: "Due Date", width: 14, format: "date", value: (entry) => entry.dueDate },
  { header: "Client", width: 24, value: (entry) => entry.customerName },
  { header: "Project", width: 34, value: (entry) => entry.projectName },
  { header: "Billing Stage", width: 30, value: (entry) => entry.label },
  { header: "Amount", width: 16, format: "peso", value: (entry) => entry.amount },
  { header: "Verified Paid", width: 16, format: "peso", value: (entry) => entry.paid },
  { header: "Balance", width: 16, format: "peso", value: (entry) => entry.balance },
  { header: "Status", width: 15, value: (entry) => entry.status },
];
const paymentColumns: XlsxColumn<CollectedEntry>[] = [
  { header: "Payment", width: 18, value: (entry) => entry.reference },
  { header: "Payment Date", width: 14, format: "date", value: (entry) => entry.paidOn },
  { header: "Client", width: 24, value: (entry) => entry.customerName },
  { header: "Project", width: 34, value: (entry) => entry.projectName },
  { header: "Invoice", width: 18, value: (entry) => entry.invoiceNumber },
  { header: "Method", width: 15, value: (entry) => entry.method },
  { header: "Amount", width: 16, format: "peso", value: (entry) => entry.amount },
  { header: "Receipt", width: 18, value: (entry) => entry.receiptNumber },
];
const generatedAt = () =>
  new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long", timeStyle: "short" });

export type CollectionsView = "overview" | "monthly";

/** Overview: contract value, billed, collected, and outstanding totals. Monthly: the month-by-month summary and its export. */
export function CollectionsSummary({ view }: { view: CollectionsView }) {
  const [report, setReport] = useState<CollectionsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedMonths, setSelectedMonths] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    fetch("/api/reports/collections", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as CollectionsReport & { error?: string };
        if (!response.ok || !payload.projects) throw new Error(payload.error ?? "Unable to load the collections report.");
        if (active) setReport(payload);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load the collections report.");
      });
    return () => {
      active = false;
    };
  }, []);

  const projects = useMemo(() => report?.projects ?? [], [report]);
  const statuses = useMemo(() => Array.from(new Set(projects.map((project) => project.status))).sort(), [projects]);
  const visibleProjects = projects.filter((project) => (!projectId || project.id === projectId) && (!status || project.status === status));
  const isFiltered = Boolean(projectId || status);
  const visibleIds = new Set(visibleProjects.map((project) => project.id));
  // Design and blueprint fees have no project, so they count only when no project filter is applied.
  const inScope = (entryProjectId: string) => (entryProjectId ? visibleIds.has(entryProjectId) : !isFiltered);
  const inRange = (date: string) => (!from || date >= from) && (!to || date <= to);
  const invalidRange = Boolean(from && to && from > to);

  const months = (() => {
    const rows = new Map<string, MonthRow>();
    const rowFor = (month: string) => {
      const row = rows.get(month) ?? { id: month, month, invoiceCount: 0, invoiced: 0, paymentCount: 0, collected: 0 };
      rows.set(month, row);
      return row;
    };
    for (const entry of report?.invoiced ?? []) {
      if (!inScope(entry.projectId) || !inRange(entry.issuedOn)) continue;
      const row = rowFor(entry.issuedOn.slice(0, 7));
      row.invoiceCount += 1;
      row.invoiced = sumMoney([row.invoiced, entry.amount]);
    }
    for (const entry of report?.collected ?? []) {
      if (!inScope(entry.projectId) || !inRange(entry.paidOn)) continue;
      const row = rowFor(entry.paidOn.slice(0, 7));
      row.paymentCount += 1;
      row.collected = sumMoney([row.collected, entry.amount]);
    }
    return [...rows.values()].sort((a, b) => b.month.localeCompare(a.month));
  })();

  const totals = {
    contract: sumMoney(visibleProjects.map((project) => project.contractPrice)),
    billed: sumMoney(visibleProjects.map((project) => project.billed)),
    collected: sumMoney(visibleProjects.map((project) => project.collected)),
    outstanding: sumMoney(visibleProjects.map((project) => project.outstanding)),
    overdue: sumMoney(visibleProjects.map((project) => project.overdue)),
  };
  const exportMonths = months.filter((row) => selectedMonths.has(row.id));
  const exportReport = () => {
    const included = (entryProjectId: string, date: string) => inScope(entryProjectId) && inRange(date) && selectedMonths.has(date.slice(0, 7));
    const invoices = (report?.invoiced ?? []).filter((entry) => included(entry.projectId, entry.issuedOn));
    const payments = (report?.collected ?? []).filter((entry) => included(entry.projectId, entry.paidOn));
    const project = projects.find((item) => item.id === projectId);
    const invoicedTotal = sumMoney(exportMonths.map((row) => row.invoiced));
    const collectedTotal = sumMoney(exportMonths.map((row) => row.collected));
    const summary: SummaryRow[] = [
      { item: "Company", value: "G4 Builders Inc" },
      { item: "Generated", value: generatedAt() },
      { item: "Project", value: project ? `${project.reference} · ${project.name}` : "All projects (including design and blueprint fees)" },
      { item: "Project Status", value: status || "All statuses" },
      { item: "Date Range", value: from || to ? `${from || "Start"} to ${to || "Today"}` : "All dates" },
      { item: "Months Included", value: [...exportMonths].reverse().map((row) => monthLabel(row.month)).join(", ") },
      { item: "", value: "" },
      { item: "Current Position", value: "" },
      { item: "Projects", value: `${visibleProjects.length}` },
      { item: "Contract Value", value: totals.contract },
      { item: "Billed (issued invoices)", value: totals.billed },
      { item: "Collected (verified payments)", value: totals.collected },
      { item: "Outstanding", value: totals.outstanding },
      { item: "Overdue", value: totals.overdue },
      { item: "", value: "" },
      { item: "Selected Months", value: "" },
      { item: "Invoiced", value: invoicedTotal },
      { item: "Collected", value: collectedTotal },
      { item: "Invoices Issued", value: `${invoices.length}` },
      { item: "Verified Payments", value: `${payments.length}` },
    ];
    exportWorkbook(`g4-collections-report-${manilaDate()}.xlsx`, [
      xlsxSheet({ name: "Summary", columns: summaryColumns, rows: summary, filters: false }),
      xlsxSheet({
        name: "By Month", columns: monthColumns, rows: exportMonths,
        totalRow: { Month: "Total", "Invoices Issued": invoices.length, Invoiced: invoicedTotal, "Verified Payments": payments.length, Collected: collectedTotal },
      }),
      xlsxSheet({
        name: "Invoices", columns: invoiceColumns, rows: invoices,
        totalRow: {
          Invoice: "Total",
          Amount: sumMoney(invoices.map((entry) => entry.amount)),
          "Verified Paid": sumMoney(invoices.map((entry) => entry.paid)),
          Balance: sumMoney(invoices.map((entry) => entry.balance)),
        },
      }),
      xlsxSheet({
        name: "Payments", columns: paymentColumns, rows: payments,
        totalRow: { Payment: "Total", Amount: sumMoney(payments.map((entry) => entry.amount)) },
      }),
    ]).catch(() => setError("Unable to create the Excel file. Try again."));
  };

  if (error && !report) return <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!report) return <div className={`${panel} text-sm text-stone-500`}>Loading collections report…</div>;

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <section className={panel}>
        <h2 className="text-lg font-semibold tracking-tight">{view === "overview" ? "Overview" : "By Month"}</h2>
        <p className="mt-1 text-sm text-stone-600">
          {view === "overview"
            ? "The current contract value, billing, and collections of the selected projects."
            : "Invoiced and collected amounts per month. Narrow it down by project, status, or dates."}
        </p>
        <div className={`mt-5 grid gap-4 md:grid-cols-2 ${view === "monthly" ? "xl:grid-cols-4" : ""}`}>
          <label className="text-sm font-medium text-stone-700">
            Project
            <SearchableSelect
              className={field}
              value={projectId}
              onChange={setProjectId}
              options={projects.map((project) => ({ value: project.id, label: `${project.reference} · ${project.name}` }))}
              placeholder="Search project"
              emptyMessage="No project matches that search."
            />
          </label>
          <label className="text-sm font-medium text-stone-700">
            Project Status
            <select className={field} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All Statuses</option>
              {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {view === "monthly" ? (
            <>
              <label className="text-sm font-medium text-stone-700">
                From
                <input type="date" className={field} max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="text-sm font-medium text-stone-700">
                To
                <input type="date" className={field} min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
            </>
          ) : null}
        </div>
      </section>

      {view === "overview" ? (
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <Metric label="Contract Value" value={formatPeso(totals.contract)} note={`${visibleProjects.length} projects`} icon={FileText} />
          <Metric label="Billed" value={formatPeso(totals.billed)} note="Issued invoices" icon={Banknote} />
          <Metric label="Collected" value={formatPeso(totals.collected)} note="Verified payments" icon={HandCoins} />
          <Metric
            label="Outstanding"
            value={formatPeso(totals.outstanding)}
            note={totals.overdue > 0 ? `${formatPeso(totals.overdue)} overdue` : "None overdue"}
            icon={totals.overdue > 0 ? AlertTriangle : Wallet}
          />
        </div>
      ) : null}

      {view === "monthly" ? (
        <section className={panel}>
          <ReportHeader
            title="Months"
            summary={`${isFiltered ? "Selected projects only" : "All projects, including design and blueprint fees"}. The export adds a summary and every invoice and payment in the checked months.`}
            exportCount={invalidRange ? 0 : exportMonths.length}
            onExport={exportReport}
          />
          {invalidRange ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">The From date must be on or before the To date.</p>
          ) : months.length === 0 ? <EmptyRow /> : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <caption className="sr-only">Collections by month</caption>
                <thead className="border-y border-stone-200 bg-stone-50">
                  <tr>
                    <SelectAllHeader ids={months.map((row) => row.id)} selection={{ selected: selectedMonths, onChange: setSelectedMonths }} />
                    <th scope="col" className={head}>Month</th>
                    <th scope="col" className={headRight}>Invoiced</th>
                    <th scope="col" className={headRight}>Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {months.map((row) => (
                    <tr key={row.id} className="hover:bg-rose-50/30">
                      <SelectRowCell id={row.id} label={monthLabel(row.month)} selection={{ selected: selectedMonths, onChange: setSelectedMonths }} />
                      <td className={`${cell} font-semibold`}>{monthLabel(row.month)}</td>
                      <td className={money}>
                        <p>{formatPeso(row.invoiced)}</p>
                        <p className="mt-1 text-xs text-stone-500">{row.invoiceCount} {row.invoiceCount === 1 ? "invoice" : "invoices"}</p>
                      </td>
                      <td className={money}>
                        <p className="font-semibold">{formatPeso(row.collected)}</p>
                        <p className="mt-1 text-xs text-stone-500">{row.paymentCount} {row.paymentCount === 1 ? "payment" : "payments"}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: LucideIcon }) {
  return (
    <div className={`${panel} min-w-0`}>
      {/* The icon shares the label row, so long amounts get the full card width below. */}
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-stone-600">{label}</p>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-stone-500">{note}</p>
    </div>
  );
}

function ReportHeader({ title, summary, exportCount, onExport }: { title: string; summary: string; exportCount: number; onExport: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-stone-600">{summary}</p>
      </div>
      <Button variant="outline" disabled={exportCount === 0} onClick={onExport}>
        <Download className="mr-2 h-4 w-4" />
        {exportCount ? `Export Selected (${exportCount})` : "Select Rows to Export"}
      </Button>
    </div>
  );
}

function EmptyRow() {
  return <p className="rounded-lg border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-500">No records match these filters.</p>;
}
