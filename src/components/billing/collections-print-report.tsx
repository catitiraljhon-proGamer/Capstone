"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { billingDate } from "@/components/billing/billing-primitives";
import { Button } from "@/components/ui/button";
import { sumMoney } from "@/lib/billing";
import { defaultContactDetails } from "@/lib/contact-details";
import { formatPeso } from "@/lib/house-design-data";
import { useContactDetails } from "@/lib/use-contact-details";
import { useModalBehavior } from "@/lib/use-modal-behavior";
import type { CollectedEntry, InvoicedEntry } from "@/types/collections-report";

export type MonthRow = { id: string; month: string; invoiceCount: number; invoiced: number; paymentCount: number; collected: number };

/** Everything one export covers, shared by the Excel file and the printable report. */
export type CollectionsExport = {
  generated: string;
  generatedBy: { name: string; role: string };
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

// When printing, only the report shows, and its tables print at full width instead of scrolling.
const printStyles = `@media print {
  body > *:not(.collections-print) { display: none !important; }
  .collections-print { position: static !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
  .collections-print .print-toolbar { display: none !important; }
  .collections-print .print-sheet { max-width: none !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
  .collections-print .overflow-x-auto { overflow: visible !important; }
  .collections-print table { min-width: 0 !important; }
  .collections-print .report-section { break-inside: avoid; }
  .collections-print h2 { break-after: avoid; }
  .collections-print tr { break-inside: avoid; }
  .collections-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 landscape; margin: 12mm; }
}`;

/** `nowrap` keeps reference numbers and dates on one line instead of breaking at the hyphen or comma. */
type Column<Row> = { header: string; value: (row: Row) => string; numeric?: boolean; nowrap?: boolean };

const invoiceColumns: Column<InvoicedEntry>[] = [
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
const paymentColumns: Column<CollectedEntry>[] = [
  { header: "Payment", value: (entry) => entry.reference, nowrap: true },
  { header: "Date", value: (entry) => billingDate(entry.paidOn), nowrap: true },
  { header: "Client", value: (entry) => entry.customerName },
  { header: "Project", value: (entry) => entry.projectName },
  { header: "Invoice", value: (entry) => entry.invoiceNumber, nowrap: true },
  { header: "Method", value: (entry) => entry.method },
  { header: "Amount", value: (entry) => formatPeso(entry.amount), numeric: true },
  { header: "Receipt", value: (entry) => entry.receiptNumber, nowrap: true },
];
const monthColumns: Column<MonthRow>[] = [
  { header: "Month", value: (row) => monthLabel(row.month) },
  { header: "Invoices Issued", value: (row) => `${row.invoiceCount}`, numeric: true },
  { header: "Invoiced", value: (row) => formatPeso(row.invoiced), numeric: true },
  { header: "Verified Payments", value: (row) => `${row.paymentCount}`, numeric: true },
  { header: "Collected", value: (row) => formatPeso(row.collected), numeric: true },
];

/**
 * The export as a printable report on top of the page. Print / Save PDF opens the browser's print window,
 * where the clerk saves it as a PDF or prints it, the same way receipts do.
 */
export function CollectionsPrintReport({ data, onClose }: { data: CollectionsExport; onClose: () => void }) {
  const contact = useContactDetails(true) ?? defaultContactDetails;
  useModalBehavior(true, onClose);
  const preparedBy = `${data.generatedBy.name}, ${data.generatedBy.role}`;
  const details: [string, string][] = [
    ["Generated", data.generated],
    ["Generated by", preparedBy],
    ["Project", data.project],
    ["Project status", data.status],
    ["Date range", data.dateRange],
    ["Months included", data.monthsIncluded],
  ];

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Printable collections report" className="collections-print fixed inset-0 z-50 overflow-y-auto bg-stone-100 px-4 py-6 sm:px-8">
      <style>{printStyles}</style>
      <div className="print-toolbar mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">Print / Save PDF opens the print window. Choose Save as PDF or a printer there.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}><X className="mr-2 h-4 w-4" />Close</Button>
          <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print / Save PDF</Button>
        </div>
      </div>

      <article className="print-sheet mx-auto max-w-5xl rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-950 shadow-sm sm:p-10">
        <header>
          <Image src="/G4/image.png" alt="G4 Builders Inc" width={1726} height={500} className="h-auto w-40 object-contain" />
          <p className="mt-3 text-xl font-semibold tracking-tight">G4 Builders Inc</p>
          <p className="mt-1 text-xs text-stone-600">{contact.address}</p>
          <p className="text-xs text-stone-600">{contact.phone} | {contact.email}</p>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-red-700">Collections Report</h1>
        </header>

        <dl className="mt-4 grid gap-x-8 gap-y-3 border-t-2 border-red-700 pt-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
              <dd className="mt-0.5 break-words">{value || "—"}</dd>
            </div>
          ))}
        </dl>

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

        <div className="report-section mt-12 grid gap-10 text-xs text-stone-600 sm:grid-cols-2">
          <p className="border-t border-stone-400 pt-2">Prepared by: {preparedBy}</p>
          <p className="border-t border-stone-400 pt-2">Checked by:</p>
        </div>
      </article>
    </div>,
    document.body,
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

function ReportTable<Row extends { id: string }>({ title, columns, rows, total }: { title: string; columns: Column<Row>[]; rows: Row[]; total: string[] }) {
  const align = (column: Column<Row>) =>
    `${column.numeric ? "text-right tabular-nums whitespace-nowrap" : "text-left"} ${column.nowrap ? "whitespace-nowrap" : ""}`;
  return (
    <section className="report-section mt-8">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-stone-500">None in the selected months.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-xs">
            <thead className="bg-red-700 text-white">
              <tr>{columns.map((column) => <th key={column.header} scope="col" className={`px-2 py-2 font-semibold ${align(column)}`}>{column.header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-stone-200 align-top">
                  {columns.map((column) => <td key={column.header} className={`px-2 py-2 ${align(column)}`}>{column.value(row)}</td>)}
                </tr>
              ))}
              <tr className="border-t-2 border-stone-400 font-semibold">
                {columns.map((column, index) => <td key={column.header} className={`px-2 py-2 ${align(column)}`}>{total[index]}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
