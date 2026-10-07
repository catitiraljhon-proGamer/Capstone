"use client";

import { useEffect, useState } from "react";
import { Download, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/house-design-data";
import { BillingErrorMessage, billingDate, billingJson } from "@/components/billing/billing-primitives";
import type { BillingInvoice, BillingReceipt } from "@/types/billing";

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
  const r = receipt?.receipt;
  const rows: [string, string][] = r ? [
    ["Receipt number", r.number], ["Customer", r.customerName], ["Project / design request", r.projectName],
    ["Invoice", r.invoiceNumber], ["Billing stage", r.invoiceLabel], ["Payment date", billingDate(r.paidAt)],
    ["Payment method", r.method], ["Transaction reference", r.transactionReference],
    ["Invoice amount", formatPeso(r.invoiceAmount)], ["Amount received", formatPeso(r.amount)],
    ["Invoice balance after this payment", formatPeso(r.balanceAfterPayment)],
    ["Verified by", r.verifiedByName], ["Receipt issued", billingDate(r.issuedAt)],
  ] : invoice ? [
    ["Invoice number", invoice.invoiceNumber], ["Customer", invoice.customerName], ["Project / design request", invoice.projectName],
    ["Billing stage", invoice.label], ["Billing basis", invoice.basis], [invoice.designRequestId ? "Billing type" : "Project progress", invoice.designRequestId ? "Design fee" : `${invoice.progressPercentage}%`],
    ["Due date", billingDate(invoice.dueDate)], ["Invoice amount", formatPeso(invoice.amount)],
    ["Verified payments", formatPeso(invoice.paid)], ["Current balance", invoice.status === "Void" ? "—" : formatPeso(invoice.balance)],
    ["Status", invoice.status === "Sent" ? "Issued" : invoice.status],
  ] : [];
  return <main className="billing-document mx-auto max-w-3xl px-5 py-8 text-stone-950">
    <style>{`@media print { .document-toolbar, [data-chat-widget] { display: none !important; } .billing-document { max-width: none; padding: 0; } .document-sheet { border: 0; box-shadow: none; } @page { margin: 18mm; } }`}</style>
    <div className="document-toolbar mb-6 flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" asChild><a href={customer ? "/customer/billing" : kind === "receipt" ? "/billing-clerk/payments" : "/billing-clerk/invoices"}><ArrowLeft className="mr-2 h-4 w-4" />Back to billing</a></Button>
      <div className="flex flex-wrap gap-2"><Button variant="outline" asChild disabled={!rows.length}><a aria-disabled={!rows.length} href={rows.length ? url + "?download=1" : undefined}><Download className="mr-2 h-4 w-4" />Download HTML</a></Button><Button disabled={!rows.length} onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print / Save PDF</Button></div>
    </div>
    <BillingErrorMessage message={error} />
    {!error && !rows.length && <p role="status" className="text-sm text-stone-500">Loading document…</p>}
    {rows.length > 0 && <article className="document-sheet rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
      <header className="border-b-2 border-red-700 pb-6"><p className="text-lg font-semibold">G4 Builders Inc</p><h1 className="mt-5 text-3xl font-semibold tracking-tight text-red-700">{kind === "receipt" ? "Payment Receipt" : (invoice?.designRequestId ? "Design Fee Invoice" : "Construction Invoice")}</h1><p className="mt-2 text-sm text-stone-500">{r?.number ?? invoice?.invoiceNumber}</p></header>
      {(receipt?.status === "Reversed" || invoice?.status === "Void") && <p className="my-5 rounded-lg border-2 border-red-700 p-4 text-sm text-red-800"><strong>VOID{receipt ? " — PAYMENT REVERSED" : ""}</strong><br />{receipt?.reversalReason ?? invoice?.voidReason}</p>}
      <dl className="divide-y divide-stone-200">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-5 py-4 text-sm"><dt className="text-stone-600">{label}</dt><dd className="whitespace-pre-wrap break-words text-right font-semibold">{value || "—"}</dd></div>)}</dl>
      <footer className="mt-6 border-t border-stone-200 pt-5 text-xs leading-6 text-stone-500">{kind === "receipt" ? "This receipt acknowledges the verified payment above. The balance shown is the invoice balance when the receipt was issued. Subsequent payments and reversals appear in your payment history." : "Please coordinate the payment method and instructions with the Billing Clerk. Submit your payment details through your customer Billing page. A receipt becomes available once the payment has been verified."}</footer>
    </article>}
  </main>;
}
