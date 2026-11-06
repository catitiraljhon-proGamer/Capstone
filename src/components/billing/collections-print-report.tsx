"use client";

import { billingDate } from "@/components/billing/billing-primitives";
import { PrintableReport, ReportTable, type PrintColumn, type ReportAuthor } from "@/components/billing/report-export";
import { sumMoney } from "@/lib/billing";
import { formatPeso } from "@/lib/house-design-data";
import type { CollectedEntry, InvoicedEntry } from "@/types/collections-report";

export type MonthRow = { id: string; month: string; invoiceCount: number; invoiced: number; paymentCount: number; collected: number };

/** Everything one export covers, shared by the Excel file and the printable report. */
export type CollectionsExport = {
  generated: string;
  generatedBy: ReportAuthor;
  project: string;
  status: string;
  dateRange: string;
  monthsIncluded: string;
  position: { projects: number; contract: number; billed: number; collected: number; outstanding: number; overdue: number };
  months: MonthRow[];
  invoices: InvoicedEntry[];
  payments: CollectedEntry[];
  invoicedTotal: number;
  collectedTotal: number;
};

export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });

const invoiceColumns: PrintColumn<InvoicedEntry>[] = [
  { header: "Invoice", value: (entry) => entry.invoiceNumber, nowrap: true },
  { header: "Issued", value: (entry) => billingDate(entry.issuedOn), nowrap: true },
  { header: "Due", value: (entry) => billingDate(entry.dueDate), nowrap: true },
  { header: "Client", value: (entry) => entry.customerName },
  { header: "Project / Billing Stage", value: (entry) => `${entry.projectName} · ${entry.label}` },
  { header: "Amount", value: (entry) => formatPeso(entry.amount), numeric: true },
  { header: "Verified Paid", value: (entry) => formatPeso(entry.paid), numeric: true },
  { header: "Balance", value: (entry) => formatPeso(entry.balance), numeric: true },
  { header: "Status", value: (entry) => entry.status },
];
const paymentColumns: PrintColumn<CollectedEntry>[] = [
  { header: "Payment", value: (entry) => entry.reference, nowrap: true },
  { header: "Date", value: (entry) => billingDate(entry.paidOn), nowrap: true },
  { header: "Client", value: (entry) => entry.customerName },
  { header: "Project", value: (entry) => entry.projectName },
  { header: "Invoice", value: (entry) => entry.invoiceNumber, nowrap: true },
  { header: "Method", value: (entry) => entry.method },
  { header: "Amount", value: (entry) => formatPeso(entry.amount), numeric: true },
  { header: "Receipt", value: (entry) => entry.receiptNumber, nowrap: true },
];
const monthColumns: PrintColumn<MonthRow>[] = [
  { header: "Month", value: (row) => monthLabel(row.month) },
  { header: "Invoices Issued", value: (row) => `${row.invoiceCount}`, numeric: true },
  { header: "Invoiced", value: (row) => formatPeso(row.invoiced), numeric: true },
  { header: "Verified Payments", value: (row) => `${row.paymentCount}`, numeric: true },
  { header: "Collected", value: (row) => formatPeso(row.collected), numeric: true },
];

/** The By Month export as a printable report: summaries, the months, and every invoice and payment in them. */
export function CollectionsPrintReport({ data, onClose }: { data: CollectionsExport; onClose: () => void }) {
  return (
    <PrintableReport
      title="Collections Report"
      generated={data.generated}
      author={data.generatedBy}
      onClose={onClose}
      details={[
        ["Project", data.project],
        ["Project status", data.status],
        ["Date range", data.dateRange],
        ["Months included", data.monthsIncluded],
      ]}
    >
      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <SummaryList title="Current Position" rows={[
          ["Projects", `${data.position.projects}`],
          ["Contract value", formatPeso(data.position.contract)],
          ["Billed (issued invoices)", formatPeso(data.position.billed)],
          ["Collected (verified payments)", formatPeso(data.position.collected)],
          ["Outstanding", formatPeso(data.position.outstanding)],
          ["Overdue", formatPeso(data.position.overdue)],
        ]} />
        <SummaryList title="Selected Months" rows={[
          ["Invoiced", formatPeso(data.invoicedTotal)],
          ["Collected", formatPeso(data.collectedTotal)],
          ["Invoices issued", `${data.invoices.length}`],
          ["Verified payments", `${data.payments.length}`],
        ]} />
      </div>

      <ReportTable title="By Month" columns={monthColumns} rows={data.months} total={["Total", `${data.invoices.length}`, formatPeso(data.invoicedTotal), `${data.payments.length}`, formatPeso(data.collectedTotal)]} />
      <ReportTable title="Invoices" columns={invoiceColumns} rows={data.invoices} total={[
        "Total", "", "", "", "",
        formatPeso(sumMoney(data.invoices.map((entry) => entry.amount))),
        formatPeso(sumMoney(data.invoices.map((entry) => entry.paid))),
        formatPeso(sumMoney(data.invoices.map((entry) => entry.balance))),
        "",
      ]} />
      <ReportTable title="Payments" columns={paymentColumns} rows={data.payments} total={["Total", "", "", "", "", "", formatPeso(data.collectedTotal), ""]} />
    </PrintableReport>
  );
}

function SummaryList({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className="report-section min-w-0">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <dl className="mt-2 divide-y divide-stone-200 border-y border-stone-200">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2">
            <dt className="text-stone-600">{label}</dt>
            <dd className="text-right font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
