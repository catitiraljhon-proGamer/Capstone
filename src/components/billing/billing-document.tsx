"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { defaultContactDetails } from "@/lib/contact-details";
import { formatPeso } from "@/lib/house-design-data";
import { useContactDetails } from "@/lib/use-contact-details";
import { BillingErrorMessage, billingDate, billingJson } from "@/components/billing/billing-primitives";
import { designFeeLabels, type BillingInvoice, type BillingReceipt } from "@/types/billing";

export function BillingDocument({ id, customer, kind }: { id: string; customer: boolean; kind: "receipt" | "invoice" }) {
  const [receipt, setReceipt] = useState<BillingReceipt | null>(null);
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = kind === "receipt" ? `/api/billing/payments/${id}/receipt` : `/api/billing/invoices/${id}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then((response) => billingJson<BillingReceipt | BillingInvoice>(response))
      .then((payload) => { if ("receipt" in payload) setReceipt(payload); else setInvoice(payload); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load the document."); });
    return () => controller.abort();
  }, [url]);
  const rows: [string, string][] = invoice ? [
    ["Invoice Number", invoice.invoiceNumber], ["Customer", invoice.customerName], ["Project / Design Request", invoice.projectName],
    ["Billing Stage", invoice.label], ["Billing Basis", invoice.basis], [invoice.designRequestId ? "Billing Type" : "Project Progress", invoice.designRequestId ? designFeeLabels[invoice.feeType ?? "design"] : `${invoice.progressPercentage}%`],
    ["Due Date", billingDate(invoice.dueDate)], ["Invoice Amount", formatPeso(invoice.amount)],
    ["Verified Payments", formatPeso(invoice.paid)], ["Current Balance", invoice.status === "Void" ? "—" : formatPeso(invoice.balance)],
    ["Status", invoice.status === "Sent" ? "Issued" : invoice.status],
  ] : [];
  const ready = Boolean(receipt || invoice);
  return <main className="billing-document mx-auto max-w-3xl px-5 py-8 text-stone-950">
    <style>{`@media print { .document-toolbar, [data-chat-widget] { display: none !important; } .billing-document { max-width: none; padding: 0; } .document-sheet { border: 0; box-shadow: none; } .document-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { margin: 18mm; } }`}</style>
    <div className="document-toolbar mb-6 flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" asChild><a href={customer ? "/customer/billing" : kind === "receipt" ? "/billing-clerk/payments" : "/billing-clerk/invoices"}><ArrowLeft className="mr-2 h-4 w-4" />Back to Billing</a></Button>
      <div className="flex flex-wrap gap-2"><Button variant="outline" asChild disabled={!ready}><a aria-disabled={!ready} href={ready ? url + "?download=1" : undefined}><Download className="mr-2 h-4 w-4" />Download HTML</a></Button><Button disabled={!ready} onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print / Save PDF</Button></div>
    </div>
    <BillingErrorMessage message={error} />
    {!error && !ready && <p role="status" className="text-sm text-stone-500">Loading document…</p>}
    {receipt && <ReceiptSheet data={receipt} />}
    {invoice && <article className="document-sheet rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
      <header className="border-b-2 border-red-700 pb-6"><p className="text-lg font-semibold">G4 Builders Inc</p><h1 className="mt-5 text-3xl font-semibold tracking-tight text-red-700">{invoice.designRequestId ? `${designFeeLabels[invoice.feeType ?? "design"]} Invoice` : "Construction Invoice"}</h1><p className="mt-2 text-sm text-stone-500">{invoice.invoiceNumber}</p></header>
      {invoice.status === "Void" && <p className="my-5 rounded-lg border-2 border-red-700 p-4 text-sm text-red-800"><strong>VOID</strong><br />{invoice.voidReason}</p>}
      <dl className="divide-y divide-stone-200">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-5 py-4 text-sm"><dt className="text-stone-600">{label}</dt><dd className="whitespace-pre-wrap break-words text-right font-semibold">{value || "—"}</dd></div>)}</dl>
      <footer className="mt-6 border-t border-stone-200 pt-5 text-xs leading-6 text-stone-500">Please coordinate the payment method and instructions with the Billing Clerk. Submit your payment details through your customer Billing page. A receipt becomes available once the payment has been verified.</footer>
    </article>}
  </main>;
}

/** Letterhead receipt: company header, recipient and receipt number, the payment line, then the payment summary. */
function ReceiptSheet({ data }: { data: BillingReceipt }) {
  const r = data.receipt;
  const contact = useContactDetails(true) ?? defaultContactDetails;
  const summary: [string, string][] = [
    ["Invoice amount", formatPeso(r.invoiceAmount)],
    ["Paid before this payment", formatPeso(Math.max(r.invoiceAmount - r.balanceAfterPayment - r.amount, 0))],
    ["Balance after this payment", formatPeso(r.balanceAfterPayment)],
  ];
  return <article className="document-sheet rounded-xl border border-stone-200 bg-white p-6 text-sm shadow-sm sm:p-10">
    <header>
      <Image src="/G4/image.png" alt="G4 Builders Inc" width={1726} height={500} priority className="h-auto w-44 object-contain" />
      <p className="mt-4 text-2xl font-semibold tracking-tight">G4 Builders Inc</p>
      <p className="mt-1 text-xs text-stone-600">{contact.address}</p>
      <p className="text-xs text-stone-600">{contact.phone} | {contact.email}</p>
    </header>
    <section className="mt-8 grid gap-6 sm:grid-cols-2 sm:items-start">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Recipient:</p>
        <p className="mt-2 text-lg font-semibold">{r.customerName}</p>
        <p className="mt-1 break-words text-stone-600">{r.projectName}</p>
      </div>
      <div className="min-w-0">
        <h1 className="break-words bg-red-700 px-4 py-3 text-xl font-semibold tracking-tight text-white">Receipt for #{r.number}</h1>
        <p className="bg-stone-100 px-4 py-2 text-xs text-stone-600">Transaction date: {billingDate(r.paidAt)}</p>
      </div>
    </section>
    {data.status === "Reversed" && <p className="mt-6 rounded-lg border-2 border-red-700 p-4 text-red-800"><strong>VOID — PAYMENT REVERSED</strong><br />{data.reversalReason}</p>}
    <div className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead className="bg-red-700 text-xs font-semibold uppercase tracking-wide text-white">
          <tr><th className="px-3 py-2.5">Billing stage</th><th className="px-3 py-2.5">Description</th><th className="px-3 py-2.5">Method</th><th className="px-3 py-2.5 text-right">Amount</th></tr>
        </thead>
        <tbody>
          <tr className="border-b border-stone-200 align-top">
            <td className="px-3 py-3 font-semibold">{r.invoiceLabel}</td>
            <td className="px-3 py-3 text-stone-600">Payment for invoice {r.invoiceNumber}<br />Reference: <span className="break-all">{r.transactionReference || "—"}</span></td>
            <td className="px-3 py-3">{r.method}</td>
            <td className="px-3 py-3 text-right font-semibold">{formatPeso(r.amount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <section className="mt-10 grid gap-8 sm:grid-cols-2">
      <div className="text-stone-600">
        <p>Thank you for your payment!</p>
        <p className="mt-3 text-xs leading-5">Verified by {r.verifiedByName}<br />Receipt issued {billingDate(r.issuedAt)}</p>
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Receipt for Payment</h2>
        <dl className="mt-3 divide-y divide-stone-200 border-t border-stone-200">
          {summary.map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-2"><dt className="text-stone-600">{label}</dt><dd>{value}</dd></div>)}
          <div className="flex justify-between gap-4 py-2 font-semibold"><dt>Amount received</dt><dd>{formatPeso(r.amount)}</dd></div>
        </dl>
      </div>
    </section>
    <footer className="mt-10 border-t border-stone-200 pt-5 text-xs leading-6 text-stone-500">This receipt acknowledges the verified payment above. The balance shown is the invoice balance when the receipt was issued. Subsequent payments and reversals appear in your payment history.</footer>
  </article>;
}
