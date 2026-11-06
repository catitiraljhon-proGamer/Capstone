"use client";

import { CollectionsPrintReport, monthLabel, type CollectionsExport, type MonthRow } from "@/components/billing/collections-print-report";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SelectAllHeader, SelectRowCell } from "@/components/ui/row-selection";
import { manilaDate, sumMoney } from "@/lib/billing";
import { exportWorkbook, xlsxSheet, type XlsxColumn } from "@/lib/export-xlsx";
import { formatPeso } from "@/lib/house-design-data";
import { useSessionUser } from "@/lib/session-store";
import type { CollectionsReport, CollectedEntry, InvoicedEntry } from "@/types/collections-report";
import { roleLabels } from "@/types/domain";
import { AlertTriangle, Banknote, ChevronDown, Download, FileSpreadsheet, FileText, HandCoins, Printer, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SummaryRow = { item: string; value: string | number };

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const field = "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-normal text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";
const head = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";
const headRight = head.replace("text-left", "text-right");
const cell = "px-4 py-4 align-top text-sm";
const money = `${cell} whitespace-nowrap text-right tabular-nums`;

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
  /** The export shown as a printable report, or null when it is closed. */
  const [printData, setPrintData] = useState<CollectionsExport | null>(null);
  const { user } = useSessionUser();

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
  /** The checked months with their filters, totals, invoices, and payments, as both export formats use them. */
  const buildExport = (): CollectionsExport => {
    const included = (entryProjectId: string, date: string) => inScope(entryProjectId) && inRange(date) && selectedMonths.has(date.slice(0, 7));
    const project = projects.find((item) => item.id === projectId);
    return {
      generated: generatedAt(),
      // Whoever is signed in made the export; the Reports page is for the Billing Clerk.
      generatedBy: { name: user?.name ?? "—", role: roleLabels[user?.role ?? "billing-clerk"] },
      project: project ? `${project.reference} · ${project.name}` : "All projects (including design and blueprint fees)",
      status: status || "All statuses",
      dateRange: from || to ? `${from || "Start"} to ${to || "Today"}` : "All dates",
      monthsIncluded: [...exportMonths].reverse().map((row) => monthLabel(row.month)).join(", "),
      position: { projects: visibleProjects.length, ...totals },
      months: exportMonths,
      invoices: (report?.invoiced ?? []).filter((entry) => included(entry.projectId, entry.issuedOn)),
      payments: (report?.collected ?? []).filter((entry) => included(entry.projectId, entry.paidOn)),
      invoicedTotal: sumMoney(exportMonths.map((row) => row.invoiced)),
      collectedTotal: sumMoney(exportMonths.map((row) => row.collected)),
    };
  };
  const exportExcel = () => {
    const { invoices, payments, invoicedTotal, collectedTotal, ...data } = buildExport();
    const summary: SummaryRow[] = [
      { item: "Company", value: "G4 Builders Inc" },
      { item: "Generated", value: data.generated },
      { item: "Generated By", value: `${data.generatedBy.name} (${data.generatedBy.role})` },
      { item: "Project", value: data.project },
      { item: "Project Status", value: data.status },
      { item: "Date Range", value: data.dateRange },
      { item: "Months Included", value: data.monthsIncluded },
      { item: "", value: "" },
      { item: "Current Position", value: "" },
      { item: "Projects", value: `${data.position.projects}` },
      { item: "Contract Value", value: data.position.contract },
      { item: "Billed (issued invoices)", value: data.position.billed },
      { item: "Collected (verified payments)", value: data.position.collected },
      { item: "Outstanding", value: data.position.outstanding },
      { item: "Overdue", value: data.position.overdue },
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
        name: "By Month", columns: monthColumns, rows: data.months,
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
            onExcel={exportExcel}
            onPdf={() => setPrintData(buildExport())}
          />
          {printData ? <CollectionsPrintReport data={printData} onClose={() => setPrintData(null)} /> : null}
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

function ReportHeader({ title, summary, exportCount, onExcel, onPdf }: {
  title: string;
  summary: string;
  exportCount: number;
  onExcel: () => void;
  onPdf: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  /** Opens the menu toward the right when the button sits near the left edge, as it does once the header wraps on phones. */
  const [alignLeft, setAlignLeft] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isOpen = menuOpen && exportCount > 0;
  const toggleMenu = () => {
    const button = buttonRef.current?.getBoundingClientRect();
    // The menu is 18rem wide; aligned to the button's right edge it would run past the left of the screen.
    setAlignLeft(Boolean(button && button.right < 18 * 16 + 16));
    setMenuOpen((open) => !open);
  };

  // The format menu closes on a click outside it or on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const choose = (action: () => void) => {
    setMenuOpen(false);
    action();
  };
  const formats = [
    { label: "Excel (.xlsx)", hint: "Summary, By Month, Invoices, and Payments sheets", icon: FileSpreadsheet, action: onExcel },
    { label: "PDF (printable)", hint: "A printable report to save as PDF or print", icon: Printer, action: onPdf },
  ];

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-stone-600">{summary}</p>
      </div>
      <div ref={menuRef} className="relative">
        <Button ref={buttonRef} variant="outline" disabled={exportCount === 0} onClick={toggleMenu} aria-haspopup="menu" aria-expanded={isOpen}>
          <Download className="mr-2 h-4 w-4" />
          {exportCount ? `Export Selected (${exportCount})` : "Select Rows to Export"}
          {exportCount ? <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" /> : null}
        </Button>
        {isOpen ? (
          <div role="menu" aria-label="Export format" className={`absolute ${alignLeft ? "left-0" : "right-0"} z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg`}>
            {formats.map(({ label, hint, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => choose(action)}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-rose-50 focus:bg-rose-50 focus:outline-none"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-stone-950">{label}</span>
                  <span className="block text-xs text-stone-500">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyRow() {
  return <p className="rounded-lg border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-500">No records match these filters.</p>;
}
