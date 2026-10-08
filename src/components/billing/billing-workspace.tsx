"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, FileText, Plus, RefreshCw, Search, WalletCards, Clock3, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/house-design-data";
import { BillingBadge, BillingDialog, BillingEmpty, BillingErrorMessage, BillingPanel, billingDate, billingFieldClass as field, billingJson } from "@/components/billing/billing-primitives";
import { InvoiceActionDialog, InvoiceForm, PaymentForm, PaymentReview, type BillingMutation } from "@/components/billing/billing-forms";
import { InvoiceTable, PaymentTable } from "@/components/billing/billing-tables";
import { manilaDate, sumMoney } from "@/lib/billing";
import { paymentMethods, type BillingData, type BillingInvoice, type BillingPayment, type BillingSection } from "@/types/billing";

const emptyData: BillingData = { designRequests: [], projects: [], invoices: [], payments: [], activity: [] };
type Dialog =
  | { type: "invoice-form"; invoice?: BillingInvoice; designRequestId?: string }
  | { type: "invoice"; invoice: BillingInvoice }
  | { type: "invoice-action"; invoice: BillingInvoice; action: "issue" | "void" | "remind" }
  | { type: "payment-form"; invoice?: BillingInvoice }
  | { type: "payment"; payment: BillingPayment }
  | { type: "account"; customerId: string; customerName: string };

function exportCsv(filename: string, rows: (string | number)[][]) {
  const content = rows.map((row) => row.map((value) => {
    const text = String(value);
    const safe = /^[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BillingWorkspace({ section = "Dashboard", customer = false }: { section?: BillingSection; customer?: boolean }) {
  const [data, setData] = useState<BillingData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const linkedInvoiceOpened = useRef(false);
  const load = useCallback((signal?: AbortSignal) => {
    return fetch("/api/billing", { cache: "no-store", signal })
      .then((response) => billingJson<BillingData>(response))
      .then((result) => { if (!signal?.aborted) {
        setData(result); setError(null);
        if (customer && !linkedInvoiceOpened.current) {
          const id = new URLSearchParams(window.location.search).get("invoice");
          const invoice = result.invoices.find((item) => item.id === id);
          if (invoice) setDialog({ type: "invoice", invoice });
          linkedInvoiceOpened.current = true;
        }
      } })
      .catch((error: unknown) => { if (!signal?.aborted) setError(error instanceof Error ? error.message : "Unable to load billing records."); })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [customer]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const mutate: BillingMutation = async (url, method, body) => {
    await billingJson(await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    setSuccess("Record saved successfully.");
    setLoading(true);
    await load();
  };
  const query = search.trim().toLowerCase();
  const matches = (values: string[]) => !query || values.join(" ").toLowerCase().includes(query);
  const milestoneLabels = Object.fromEntries(data.projects.flatMap((project) => project.milestones.map((milestone) => [milestone.id, milestone.label])));
  const issued = data.invoices.filter((invoice) => !["Draft", "Ready", "Void"].includes(invoice.status));
  const unpaid = issued.filter((invoice) => invoice.balance > 0);
  const overdue = unpaid.filter((invoice) => invoice.overdue);
  const pending = data.payments.filter((payment) => payment.status === "Pending");
  const month = manilaDate().slice(0, 7);
  const verified = data.payments.filter((payment) => payment.status === "Verified");
  const collectedThisMonth = sumMoney(verified.filter((payment) => manilaDate(new Date(payment.paidAt)).startsWith(month)).map((payment) => payment.amount));
  const filteredInvoices = data.invoices.filter((invoice) =>
    (!projectId || invoice.projectId === projectId) && (!status || (status === "Overdue" ? invoice.overdue : invoice.status === status)) &&
    matches([invoice.invoiceNumber, invoice.customerName, invoice.projectName, invoice.label]) &&
    (section !== "Invoices" || !["Draft", "Ready"].includes(invoice.status)),
  );
  const filteredPayments = data.payments.filter((payment) =>
    (!projectId || payment.projectId === projectId) && (!status || payment.status === status) &&
    matches([payment.reference, payment.customerName, payment.invoiceNumber, payment.transactionReference, payment.receiptNumber ?? ""]),
  );
  const inRange = (date: string) => (!from || date >= from) && (!to || date <= to);
  const reportPayments = verified.filter((payment) => (!projectId || payment.projectId === projectId) && inRange(manilaDate(new Date(payment.paidAt))));
  const reportInvoices = unpaid.filter((invoice) => (!projectId || invoice.projectId === projectId) && inRange(invoice.dueDate));
  const accounts = Array.from(new Map([...data.projects, ...data.invoices].map((item) => [item.customerId, { id: item.customerId, name: item.customerName }])).values())
    .map((account) => {
      const projects = data.projects.filter((project) => project.customerId === account.id);
      const invoices = issued.filter((invoice) => invoice.customerId === account.id);
      return { ...account, projects, billed: sumMoney(invoices.map((invoice) => invoice.amount)), paid: sumMoney(verified.filter((payment) => payment.customerId === account.id).map((payment) => payment.amount)), outstanding: sumMoney(invoices.map((invoice) => invoice.balance)) };
    }).filter((account) => matches([account.name, ...account.projects.map((project) => project.name)]) && (!projectId || account.projects.some((project) => project.id === projectId)));
  const close = () => setDialog(null);
  const viewInvoice = (invoice: BillingInvoice) => setDialog({ type: "invoice", invoice });
  const viewPayment = (payment: BillingPayment) => setDialog({ type: "payment", payment });
  const title = customer ? "Your invoices & payments" : section === "Dashboard" ? "Collections overview" : section === "Payments" ? "Payments & receipts" : section;
  const description = customer ? "Review your bills, submit payment details, and access receipts for verified payments."
    : section === "Dashboard" ? "Prepare billings, review incoming payments, and keep every customer balance up to date."
    : section === "Progress Billings" ? "Prepare drafts from agreed contract milestones and approved work."
    : section === "Invoices" ? "Track issued invoices, partial payments, due dates, and follow-ups."
    : section === "Payments" ? "Confirm actual transactions before issuing a receipt."
    : section === "Customer Accounts" ? "View each customer's projects, billings, and payment history."
    : "Review verified collections and outstanding invoices by project and date.";
  const invoiceStatuses = ["Draft", "Ready", "Sent", "Partially Paid", "Paid", "Overdue", "Void"];
  const paymentStatuses = ["Pending", "Verified", "Rejected", "Reversed"];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-red-700">{customer ? "Customer billing" : "Billing Clerk"}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{description}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={loading} onClick={() => { setSuccess(null); setLoading(true); void load(); }}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        {!customer && ["Dashboard", "Progress Billings", "Invoices"].includes(section) && <Button disabled={loading || Boolean(error)} onClick={() => setDialog({ type: "invoice-form" })}><Plus className="mr-2 h-4 w-4" />Prepare billing</Button>}
        {(customer || section === "Payments") && <Button disabled={loading || Boolean(error) || !unpaid.length} onClick={() => setDialog({ type: "payment-form" })}><Plus className="mr-2 h-4 w-4" />{customer ? "Submit payment" : "Record payment"}</Button>}
      </div>
    </div>
    <BillingErrorMessage message={error} />
    {success && <p role="status" className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">{success}</p>}
    {loading && <p role="status" className="text-sm text-stone-500">Loading billing records…</p>}
    {!error && !loading && <>
      {!customer && ["Dashboard", "Progress Billings"].includes(section) && data.designRequests.some((design) => !design.invoiceId) && <BillingPanel>
        <h2 className="text-lg font-semibold tracking-tight">Completed designs awaiting fee invoice</h2><p className="mt-1 text-sm text-stone-600">The admin has delivered these designs. Prepare the agreed fee so the customer can pay and unlock their images.</p>
        <div className="mt-4 divide-y divide-stone-200">{data.designRequests.filter((design) => !design.invoiceId).map((design) => <div key={design.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{design.customerName}</p><p className="mt-1 text-xs text-stone-500">{design.label}</p></div><Button variant="outline" onClick={() => setDialog({ type: "invoice-form", designRequestId: design.id })}>Prepare design fee</Button></div>)}</div>
      </BillingPanel>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(customer ? [
          { label: "Total invoiced", value: formatPeso(sumMoney(issued.map((invoice) => invoice.amount))), note: "Construction and design fee invoices", icon: FileText },
          { label: "Verified payments", value: formatPeso(sumMoney(verified.map((payment) => payment.amount))), note: "Confirmed payments only", icon: WalletCards },
          { label: "Outstanding balance", value: formatPeso(sumMoney(unpaid.map((invoice) => invoice.balance))), note: "Unpaid portion of issued invoices", icon: ReceiptText },
          { label: "Awaiting verification", value: String(pending.length), note: "Payment submissions under review", icon: Clock3 },
        ] : [
          { label: "Outstanding balance", value: formatPeso(sumMoney(unpaid.map((invoice) => invoice.balance))), note: `${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"}`, icon: FileText },
          { label: "Collected this month", value: formatPeso(collectedThisMonth), note: "Verified payments by payment date", icon: WalletCards },
          { label: "Payments to review", value: String(pending.length), note: "Awaiting transaction confirmation", icon: ReceiptText },
          { label: "Overdue invoices", value: String(overdue.length), note: `${formatPeso(sumMoney(overdue.map((invoice) => invoice.balance)))} outstanding`, icon: Clock3 },
        ]).map((metric) => <BillingPanel key={metric.label}><div className="flex items-start justify-between gap-2"><p className="text-sm text-stone-600">{metric.label}</p><metric.icon className="h-5 w-5 shrink-0 text-red-700" /></div><p className="mt-3 break-words text-2xl font-semibold tracking-tight">{metric.value}</p><p className="mt-2 text-xs text-stone-500">{metric.note}</p></BillingPanel>)}
      </div>
      {!customer && section === "Dashboard" ? <>
        <section className="rounded-xl bg-gradient-to-r from-red-950 to-red-800 p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-rose-200">Your billing workflow</p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">From approved work to a verified payment.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-rose-100">Prepare the billing, review and issue the invoice, then verify each payment. Every verified payment gets its own receipt.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/billing-clerk/progress-billings" className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-red-900">Review drafts ({data.invoices.filter((invoice) => ["Draft", "Ready"].includes(invoice.status)).length})</Link><Link href="/billing-clerk/payments" className="flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2.5 text-sm font-semibold">Verify payments <ArrowRight className="h-4 w-4" /></Link></div>
        </section>
        <BillingPanel><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">Payments awaiting verification</h2><Link className="text-sm font-semibold text-red-700" href="/billing-clerk/payments">View payments</Link></div><PaymentTable payments={pending.slice(0, 5)} customer={false} onView={viewPayment} /></BillingPanel>
        <BillingPanel><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">Invoices needing follow-up</h2><Link className="text-sm font-semibold text-red-700" href="/billing-clerk/invoices">View invoices</Link></div><InvoiceTable invoices={[...unpaid].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5)} onView={viewInvoice} /></BillingPanel>
        <BillingPanel><h2 className="mb-4 text-lg font-semibold tracking-tight">Recent billing activity</h2>{!data.activity.length ? <BillingEmpty text="Activity will appear as billings and payments are recorded." /> : <div className="divide-y divide-stone-100">{data.activity.map((activity) => <div key={activity.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><p><span className="font-medium">{activity.actorName}</span><span className="ml-2 text-stone-600">{activity.action.replaceAll(".", " · ")}</span></p><time className="text-xs text-stone-500">{new Date(activity.date).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</time></div>)}</div>}</BillingPanel>
      </> : <>
        <BillingPanel>
          <div className="grid items-end gap-3 md:grid-cols-3">
            {section !== "Reports" && <label className="text-xs font-semibold text-stone-600"><span className="flex items-center gap-1"><Search className="h-3.5 w-3.5" />Search records</span><input type="search" className={field} placeholder="Customer, project or reference…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
            <label className="text-xs font-semibold text-stone-600">Project<select className={field} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.reference} · {project.name}</option>)}</select></label>
            {!customer && ["Progress Billings", "Invoices", "Payments"].includes(section) && <label className="text-xs font-semibold text-stone-600">Status<select className={field} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{(section === "Payments" ? paymentStatuses : invoiceStatuses.filter((value) => section !== "Invoices" || !["Draft", "Ready"].includes(value))).map((value) => <option key={value} value={value}>{value === "Sent" ? "Issued" : value}</option>)}</select></label>}
            {section === "Reports" && <><label className="text-xs font-semibold text-stone-600">From<input type="date" className={field} max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-semibold text-stone-600">To<input type="date" className={field} min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></label></>}
          </div>
        </BillingPanel>
        {(customer || ["Progress Billings", "Invoices"].includes(section)) && <BillingPanel><h2 className="mb-5 text-lg font-semibold tracking-tight">{section === "Progress Billings" && !customer ? "Drafts & progress billings" : "Invoices"}</h2><InvoiceTable key={search + projectId + status} invoices={filteredInvoices} milestoneLabels={milestoneLabels} onView={viewInvoice} />{!data.projects.length && !data.invoices.length && !data.designRequests.length && <p className="mt-4 text-sm text-stone-600">{customer ? "Your project and invoices will appear here when they are ready." : "Prepare billing for an agreed construction contract or an admin-delivered design request."}</p>}</BillingPanel>}
        {(customer || section === "Payments") && <BillingPanel><h2 className="mb-5 text-lg font-semibold tracking-tight">Payment history & receipts</h2><PaymentTable key={search + projectId + status} payments={filteredPayments} customer={customer} onView={viewPayment} /></BillingPanel>}
        {section === "Customer Accounts" && <BillingPanel><h2 className="mb-5 text-lg font-semibold tracking-tight">Customer balances</h2>{!accounts.length ? <BillingEmpty /> : <div className="divide-y divide-stone-200">{accounts.map((account) => <div key={account.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><p className="font-semibold">{account.name}</p><p className="mt-1 text-xs text-stone-500">{account.projects.length} projects · {formatPeso(account.billed)} invoiced · {formatPeso(account.paid)} paid</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="font-semibold text-red-700">{formatPeso(account.outstanding)}</p><p className="text-xs text-stone-500">Outstanding</p></div><Button variant="outline" onClick={() => setDialog({ type: "account", customerId: account.id, customerName: account.name })}>View account</Button></div></div>)}</div>}</BillingPanel>}
        {section === "Reports" && <>
          <p className="text-sm text-stone-600">Collections use the payment date and currently verified payments. Outstanding invoices use their due date and current balance. Pending, rejected, and reversed payments are excluded from collections.</p>
          <BillingPanel><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Verified collections</h2><p className="mt-1 text-sm text-stone-600">{reportPayments.length} payments · <strong>{formatPeso(sumMoney(reportPayments.map((payment) => payment.amount)))}</strong></p></div><Button variant="outline" disabled={!reportPayments.length || Boolean(from && to && from > to)} onClick={() => exportCsv("g4-collections.csv", [["Payment", "Customer", "Project", "Invoice", "Payment date", "Method", "Amount PHP", "Receipt"], ...reportPayments.map((payment) => [payment.reference, payment.customerName, payment.projectName, payment.invoiceNumber, manilaDate(new Date(payment.paidAt)), payment.method, payment.amount, payment.receiptNumber ?? "Legacy record"])])}><Download className="mr-2 h-4 w-4" />Export CSV</Button></div>
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{paymentMethods.map((method) => <div className="rounded-lg bg-stone-50 p-3" key={method}><p className="text-xs text-stone-500">{method}</p><p className="mt-2 font-semibold">{formatPeso(sumMoney(reportPayments.filter((payment) => payment.method === method).map((payment) => payment.amount)))}</p></div>)}</div>
            <PaymentTable key={from + to + projectId} payments={reportPayments} customer={false} onView={viewPayment} />
          </BillingPanel>
          <BillingPanel><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Outstanding invoices</h2><p className="mt-1 text-sm text-stone-600">{reportInvoices.length} invoices · <strong>{formatPeso(sumMoney(reportInvoices.map((invoice) => invoice.balance)))}</strong></p></div><Button variant="outline" disabled={!reportInvoices.length || Boolean(from && to && from > to)} onClick={() => exportCsv("g4-outstanding-invoices.csv", [["Invoice", "Customer", "Project", "Due date", "Amount PHP", "Verified paid PHP", "Balance PHP", "Status", "Overdue"], ...reportInvoices.map((invoice) => [invoice.invoiceNumber, invoice.customerName, invoice.projectName, invoice.dueDate, invoice.amount, invoice.paid, invoice.balance, invoice.status, invoice.overdue ? "Yes" : "No"])])}><Download className="mr-2 h-4 w-4" />Export CSV</Button></div><InvoiceTable key={from + to + projectId} invoices={reportInvoices} onView={viewInvoice} /></BillingPanel>
        </>}
      </>}
    </>}
    {dialog?.type === "invoice-form" && <InvoiceForm projects={data.projects} designRequests={data.designRequests} designRequestId={dialog.designRequestId} invoice={dialog.invoice} mutate={mutate} onClose={close} />}
    {dialog?.type === "payment-form" && <PaymentForm invoices={data.invoices} selectedInvoice={dialog.invoice} customer={customer} mutate={mutate} onClose={close} />}
    {dialog?.type === "invoice-action" && <InvoiceActionDialog invoice={dialog.invoice} action={dialog.action} mutate={mutate} onClose={close} />}
    {dialog?.type === "payment" && <PaymentReview payment={dialog.payment} customer={customer} mutate={mutate} onClose={close} />}
    {dialog?.type === "invoice" && <BillingDialog title={dialog.invoice.invoiceNumber} onClose={close}>
      <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{dialog.invoice.label}</h3><p className="mt-1 text-sm text-stone-600">{dialog.invoice.customerName}</p><p className="mt-1 text-xs text-stone-500">{dialog.invoice.projectName}</p></div><BillingBadge status={dialog.invoice.status} /></div>
        <div className="grid gap-3 rounded-lg bg-stone-50 p-4 sm:grid-cols-3">{[["Invoice amount", dialog.invoice.amount], ["Verified paid", dialog.invoice.paid], ["Remaining balance", dialog.invoice.balance]].map(([label, value]) => <div key={label}><p className="text-xs text-stone-500">{label}</p><p className="mt-1 font-semibold">{dialog.invoice.status === "Void" && label === "Remaining balance" ? "—" : formatPeso(Number(value))}</p></div>)}</div>
        <p className="text-sm text-stone-600">Due {billingDate(dialog.invoice.dueDate)}{dialog.invoice.designRequestId ? " · Design fee" : " · Project progress: " + dialog.invoice.progressPercentage + "%"}{dialog.invoice.overdue ? " · Overdue balance" : ""}</p>
        <div><p className="text-sm font-semibold">Billing basis</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">{dialog.invoice.basis || "No reference recorded. Add the billing basis before issuing."}</p></div>
        {dialog.invoice.voidReason && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Void reason: {dialog.invoice.voidReason}</p>}
        <div className="flex flex-wrap gap-2">
          {customer && dialog.invoice.designRequestId && <Button asChild><Link href="/customer/house-design">Open My House Design</Link></Button>}
          <Button variant="outline" asChild><a target="_blank" rel="noreferrer" href={`/${customer ? "customer" : "billing-clerk"}/invoices/${dialog.invoice.id}`}>Print / download invoice</a></Button>
          {!customer && ["Draft", "Ready"].includes(dialog.invoice.status) && <><Button variant="outline" onClick={() => setDialog({ type: "invoice-form", invoice: dialog.invoice })}>Edit draft</Button><Button onClick={() => setDialog({ type: "invoice-action", invoice: dialog.invoice, action: "issue" })}>Issue invoice</Button></>}
          {!["Draft", "Ready", "Void"].includes(dialog.invoice.status) && dialog.invoice.balance > 0 && <><Button onClick={() => setDialog({ type: "payment-form", invoice: dialog.invoice })}>{customer ? "Submit payment" : "Record payment"}</Button>{!customer && <Button variant="outline" onClick={() => setDialog({ type: "invoice-action", invoice: dialog.invoice, action: "remind" })}>Send reminder</Button>}</>}
          {!customer && dialog.invoice.status !== "Void" && <Button variant="ghost" onClick={() => setDialog({ type: "invoice-action", invoice: dialog.invoice, action: "void" })}>Void invoice</Button>}
        </div>
        <div className="border-t border-stone-200 pt-4"><h3 className="mb-4 font-semibold">Payments for this invoice</h3><div className="px-5"><PaymentTable payments={data.payments.filter((payment) => payment.invoiceId === dialog.invoice.id)} customer={customer} onView={viewPayment} /></div></div>
      </div>
    </BillingDialog>}
    {dialog?.type === "account" && <BillingDialog title={dialog.customerName} onClose={close}><div className="space-y-5">
      {data.projects.filter((project) => project.customerId === dialog.customerId).map((project) => <div key={project.id} className="rounded-lg border border-stone-200 p-4"><p className="font-semibold">{project.reference} · {project.name}</p><p className="mt-2 text-sm text-stone-600">Contract {formatPeso(project.contractPrice)} · Invoiced {formatPeso(project.billed)}</p><p className="mt-1 text-sm text-stone-600">Verified payments {formatPeso(project.paid)} · Outstanding {formatPeso(project.outstanding)}</p></div>)}
      <h3 className="font-semibold">Invoice history</h3><div className="px-5"><InvoiceTable invoices={data.invoices.filter((invoice) => invoice.customerId === dialog.customerId)} milestoneLabels={milestoneLabels} onView={viewInvoice} /></div>
      <h3 className="font-semibold">Payment history</h3><div className="px-5"><PaymentTable payments={data.payments.filter((payment) => payment.customerId === dialog.customerId)} customer={false} onView={viewPayment} /></div>
    </div></BillingDialog>}
  </div>;
}
