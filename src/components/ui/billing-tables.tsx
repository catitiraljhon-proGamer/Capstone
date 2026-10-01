"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/components/ui/house-design-data";
import { BillingBadge, BillingEmpty, billingDate } from "@/components/ui/billing-primitives";
import type { BillingInvoice, BillingPayment } from "@/types/billing";

const head = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";
const cell = "px-4 py-4 align-top text-sm";

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (value: number) => void }) {
  if (total <= 10) return null;
  return <div className="flex items-center justify-between gap-3 border-t border-stone-200 px-4 pt-4 text-xs text-stone-500">
    <span>{page * 10 + 1}–{Math.min(total, (page + 1) * 10)} of {total}</span>
    <div className="flex gap-2"><Button size="icon" variant="outline" aria-label="Previous records" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" aria-label="Next records" disabled={(page + 1) * 10 >= total} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
  </div>;
}

export function InvoiceTable({ invoices, onView }: { invoices: BillingInvoice[]; onView: (invoice: BillingInvoice) => void }) {
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(invoices.length / 10) - 1));
  if (!invoices.length) return <BillingEmpty />;
  return <><div className="-mx-5 overflow-x-auto"><table className="w-full min-w-[780px] border-collapse"><caption className="sr-only">Billing and invoice records</caption>
    <thead className="border-y border-stone-200 bg-stone-50"><tr>{["Invoice / customer", "Billing stage", "Amount / paid", "Balance", "Due / status", ""].map((label, index) => <th scope="col" key={index} className={head}>{label || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
    <tbody className="divide-y divide-stone-100">{invoices.slice(page * 10, page * 10 + 10).map((invoice) => <tr key={invoice.id} className="hover:bg-rose-50/30">
      <td className={cell}><p className="font-semibold">{invoice.invoiceNumber}</p><p className="mt-1 text-stone-600">{invoice.customerName}</p></td>
      <td className={cell}><p className="max-w-56 break-words font-medium">{invoice.label}</p><p className="mt-1 max-w-56 text-xs text-stone-500">{invoice.projectName}</p></td>
      <td className={cell}><p className="whitespace-nowrap font-semibold">{formatPeso(invoice.amount)}</p><p className="mt-1 whitespace-nowrap text-xs text-stone-500">{formatPeso(invoice.paid)} paid</p></td>
      <td className={cell}><p className={`whitespace-nowrap font-semibold ${invoice.overdue ? "text-red-700" : ""}`}>{invoice.status === "Void" ? "—" : formatPeso(invoice.balance)}</p></td>
      <td className={cell}><p className="mb-2 whitespace-nowrap text-xs text-stone-500">{billingDate(invoice.dueDate)}</p><BillingBadge status={invoice.status} />{invoice.overdue && invoice.status !== "Overdue" && <p className="mt-1 text-xs font-medium text-red-700">Overdue balance</p>}</td>
      <td className={cell}><Button variant="outline" size="sm" onClick={() => onView(invoice)} aria-label={`View ${invoice.invoiceNumber}`}>View <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Button></td>
    </tr>)}</tbody>
  </table></div><Pager page={page} total={invoices.length} onPage={setPage} /></>;
}

export function PaymentTable({ payments, customer, onView }: { payments: BillingPayment[]; customer: boolean; onView: (payment: BillingPayment) => void }) {
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(payments.length / 10) - 1));
  if (!payments.length) return <BillingEmpty />;
  return <><div className="-mx-5 overflow-x-auto"><table className="w-full min-w-[820px] border-collapse"><caption className="sr-only">Payments and receipts</caption>
    <thead className="border-y border-stone-200 bg-stone-50"><tr>{["Payment / invoice", "Customer / method", "Amount", "Date / status", "Receipt", ""].map((label, index) => <th scope="col" key={index} className={head}>{label || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
    <tbody className="divide-y divide-stone-100">{payments.slice(page * 10, page * 10 + 10).map((payment) => <tr key={payment.id} className="hover:bg-rose-50/30">
      <td className={cell}><p className="font-semibold">{payment.reference}</p><p className="mt-1 text-xs text-stone-500">{payment.invoiceNumber}</p></td>
      <td className={cell}><p>{payment.customerName}</p><p className="mt-1 text-xs text-stone-500">{payment.method}</p></td>
      <td className={cell + " whitespace-nowrap font-semibold"}>{formatPeso(payment.amount)}</td>
      <td className={cell}><p className="mb-2 whitespace-nowrap text-xs text-stone-500">{billingDate(payment.paidAt)}</p><BillingBadge status={payment.status} /></td>
      <td className={cell}>{payment.receiptNumber ? <a className="whitespace-nowrap font-medium text-red-700 underline underline-offset-4" target="_blank" rel="noreferrer" href={`/${customer ? "customer" : "billing-clerk"}/receipts/${payment.id}`}>{payment.receiptNumber}{payment.status === "Reversed" ? " (void)" : ""}</a> : <span className="text-xs text-stone-400">{payment.status === "Verified" ? "Legacy record" : "Not issued"}</span>}</td>
      <td className={cell}><Button variant="outline" size="sm" onClick={() => onView(payment)} aria-label={`${customer ? "View" : "Review"} ${payment.reference}`}>{customer || !["Pending", "Verified"].includes(payment.status) ? "View" : "Review"}</Button></td>
    </tr>)}</tbody>
  </table></div><Pager page={page} total={payments.length} onPage={setPage} /></>;
}
