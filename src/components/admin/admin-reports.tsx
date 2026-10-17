"use client";

import { Button } from "@/components/ui/button";
import { SelectAllHeader, SelectRowCell } from "@/components/ui/row-selection";
import { sumMoney } from "@/lib/billing";
import { exportXlsx, type XlsxColumn } from "@/lib/export-xlsx";
import { formatPeso } from "@/lib/house-design-data";
import type { AdminCollectionsReport, ProjectCollectionRow } from "@/types/admin-reports";
import { AlertTriangle, Banknote, Download, FileText, HandCoins, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type MonthRow = { id: string; month: string; invoiceCount: number; invoiced: number; paymentCount: number; collected: number };

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const field = "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-normal text-stone-950 outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15";
const head = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";
const headRight = head.replace("text-left", "text-right");
const cell = "px-4 py-4 align-top text-sm";
const money = `${cell} whitespace-nowrap text-right tabular-nums`;

const collectedShare = (project: ProjectCollectionRow) => (project.contractPrice > 0 ? project.collected / project.contractPrice : 0);
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });

const projectColumns: XlsxColumn<ProjectCollectionRow>[] = [
  { header: "Project", width: 16, value: (project) => project.reference },
  { header: "Project Name", width: 32, value: (project) => project.name },
  { header: "Client", width: 24, value: (project) => project.customerName },
  { header: "Status", width: 20, value: (project) => project.status },
  { header: "Contract Price", width: 17, format: "peso", value: (project) => project.contractPrice },
  { header: "Billed", width: 17, format: "peso", value: (project) => project.billed },
  { header: "Collected", width: 17, format: "peso", value: (project) => project.collected },
  { header: "Outstanding", width: 17, format: "peso", value: (project) => project.outstanding },
  { header: "Overdue", width: 17, format: "peso", value: (project) => project.overdue },
  { header: "Contract Collected", width: 18, format: "percent", value: collectedShare },
];
const monthColumns: XlsxColumn<MonthRow>[] = [
  { header: "Month", width: 18, format: "month", value: (row) => row.month },
  { header: "Invoices Issued", width: 16, value: (row) => row.invoiceCount },
  { header: "Invoiced", width: 17, format: "peso", value: (row) => row.invoiced },
  { header: "Verified Payments", width: 18, value: (row) => row.paymentCount },
  { header: "Collected", width: 17, format: "peso", value: (row) => row.collected },
];

export function AdminReports() {
  const [report, setReport] = useState<AdminCollectionsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<ReadonlySet<string>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    fetch("/api/reports/collections", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as AdminCollectionsReport & { error?: string };
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
  const exportProjects = visibleProjects.filter((project) => selectedProjects.has(project.id));
  const exportMonths = months.filter((row) => selectedMonths.has(row.id));
  const exportReport = <Row,>(filename: string, sheetName: string, columns: XlsxColumn<Row>[], rows: Row[]) => {
    exportXlsx({ filename, sheetName, columns, rows }).catch(() => setError("Unable to create the Excel file. Try again."));
  };

  if (error && !report) return <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!report) return <div className={`${panel} text-sm text-stone-500`}>Loading collections report…</div>;

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <section className={panel}>
        <h2 className="text-lg font-semibold tracking-tight">Collections Summary</h2>
        <p className="mt-1 text-sm text-stone-600">
          Contract value, billing, and collections across projects. Billing records are managed by the Billing Clerk; this report is view-only.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-stone-700">
            Project
            <select className={field} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">All Projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.reference} · {project.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-700">
            Project Status
            <select className={field} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All Statuses</option>
              {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-700">
            From
            <input type="date" className={field} max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-stone-700">
            To
            <input type="date" className={field} min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-stone-500">
          The date range applies to the monthly summary. Project totals show each project&apos;s current position.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className={panel}>
        <ReportHeader
          title="By Project"
          summary={`${visibleProjects.length} projects · ${formatPeso(totals.collected)} collected`}
          exportCount={exportProjects.length}
          onExport={() => exportReport("g4-collections-by-project.xlsx", "By Project", projectColumns, exportProjects)}
        />
        {visibleProjects.length === 0 ? <EmptyRow /> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <caption className="sr-only">Collections by project</caption>
              <thead className="border-y border-stone-200 bg-stone-50">
                <tr>
                  <SelectAllHeader ids={visibleProjects.map((project) => project.id)} selection={{ selected: selectedProjects, onChange: setSelectedProjects }} />
                  <th scope="col" className={head}>Project / Client</th>
                  <th scope="col" className={head}>Status</th>
                  <th scope="col" className={headRight}>Contract</th>
                  <th scope="col" className={headRight}>Billed</th>
                  <th scope="col" className={headRight}>Collected</th>
                  <th scope="col" className={headRight}>Outstanding</th>
                  <th scope="col" className={head}>Contract Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibleProjects.map((project) => {
                  const share = collectedShare(project);
                  return (
                    <tr key={project.id} className="hover:bg-rose-50/30">
                      <SelectRowCell id={project.id} label={project.reference} selection={{ selected: selectedProjects, onChange: setSelectedProjects }} />
                      <td className={cell}>
                        <p className="font-semibold">{project.reference} · {project.name}</p>
                        <p className="mt-1 text-stone-600">{project.customerName}</p>
                      </td>
                      <td className={cell}><span className="whitespace-nowrap rounded bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700">{project.status}</span></td>
                      <td className={money}>{formatPeso(project.contractPrice)}</td>
                      <td className={money}>{formatPeso(project.billed)}</td>
                      <td className={`${money} font-semibold`}>{formatPeso(project.collected)}</td>
                      <td className={money}>
                        <p>{formatPeso(project.outstanding)}</p>
                        {project.overdue > 0 ? <p className="mt-1 text-xs font-medium text-red-700">{formatPeso(project.overdue)} overdue</p> : null}
                      </td>
                      <td className={cell}>
                        <div className="flex min-w-32 items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-rose-50">
                            <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.min(100, share * 100)}%` }} />
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums text-stone-600">{(share * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={panel}>
        <ReportHeader
          title="By Month"
          summary={isFiltered ? "Selected projects only" : "All projects, including design and blueprint fees"}
          exportCount={invalidRange ? 0 : exportMonths.length}
          onExport={() => exportReport("g4-collections-by-month.xlsx", "By Month", monthColumns, exportMonths)}
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
    </div>
  );
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: LucideIcon }) {
  return (
    <div className={panel}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-600">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-stone-500">{note}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700"><Icon className="h-5 w-5" /></span>
      </div>
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
