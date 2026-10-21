"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Download, FileText, Plus, RefreshCw, Search, Smartphone, WalletCards, Clock3, ReceiptText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/house-design-data";
import { BillingBadge, BillingDialog, BillingEmpty, BillingErrorMessage, BillingPanel, billingDate, billingFieldClass as field, billingJson } from "@/components/billing/billing-primitives";
import { InvoiceActionDialog, InvoiceForm, PayOnlineDialog, PaymentForm, PaymentReview, type BillingMutation } from "@/components/billing/billing-forms";
import { InvoiceTable, PaymentTable } from "@/components/billing/billing-tables";
import { manilaDate, sumMoney } from "@/lib/billing";
import { exportXlsx, type XlsxColumn } from "@/lib/export-xlsx";
import type { PaymongoCheckoutDto } from "@/types/paymongo";
import { designFeeLabels, paymentMethods, type BillingData, type BillingInvoice, type BillingPayment, type BillingSection } from "@/types/billing";

const emptyData: BillingData = { designRequests: [], projects: [], invoices: [], payments: [] };
type Dialog =
  | { type: "invoice-form"; invoice?: BillingInvoice; designRequestId?: string }
  | { type: "invoice"; invoice: BillingInvoice }
  | { type: "invoice-action"; invoice: BillingInvoice; action: "issue" | "void" | "remind" }
  | { type: "payment-form"; invoice?: BillingInvoice }
  | { type: "pay-online"; invoice: BillingInvoice }
  | { type: "payment"; payment: BillingPayment }
  | { type: "account"; customerId: string; customerName: string };

const collectionColumns: XlsxColumn<BillingPayment>[] = [
  { header: "Payment", width: 18, value: (payment) => payment.reference },
  { header: "Customer", width: 24, value: (payment) => payment.customerName },
  { header: "Project", width: 36, value: (payment) => payment.projectName },
  { header: "Invoice", width: 18, value: (payment) => payment.invoiceNumber },
  { header: "Payment Date", width: 15, format: "date", value: (payment) => manilaDate(new Date(payment.paidAt)) },
  { header: "Method", width: 15, value: (payment) => payment.method },
  { header: "Amount", width: 16, format: "peso", value: (payment) => payment.amount },
  { header: "Receipt", width: 18, value: (payment) => payment.receiptNumber ?? "Legacy record" },
];
const outstandingColumns: XlsxColumn<BillingInvoice>[] = [
  { header: "Invoice", width: 18, value: (invoice) => invoice.invoiceNumber },
  { header: "Customer", width: 24, value: (invoice) => invoice.customerName },
  { header: "Project", width: 36, value: (invoice) => invoice.projectName },
  { header: "Due Date", width: 15, format: "date", value: (invoice) => invoice.dueDate },
  { header: "Amount", width: 16, format: "peso", value: (invoice) => invoice.amount },
  { header: "Verified Paid", width: 16, format: "peso", value: (invoice) => invoice.paid },
  { header: "Balance", width: 16, format: "peso", value: (invoice) => invoice.balance },
  { header: "Status", width: 14, value: (invoice) => invoice.status },
  { header: "Overdue", width: 10, value: (invoice) => (invoice.overdue ? "Yes" : "No") },
];

const checkoutPollMs = 2000;
const checkoutPollMaxMs = 30_000;

/** Shown after the customer returns from the (simulated) PayMongo checkout; polls the session while it is still open. */
function CheckoutReturnBanner({ sessionId, onResolved, onDismiss }: { sessionId: string; onResolved: () => void; onDismiss: () => void }) {
  const [checkout, setCheckout] = useState<PaymongoCheckoutDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const resolvedRef = useRef(onResolved);
  useEffect(() => { resolvedRef.current = onResolved; });
  useEffect(() => {
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/payments/paymongo/checkout/${encodeURIComponent(sessionId)}`, { cache: "no-store", signal: controller.signal });
        const result = await billingJson<{ checkout: PaymongoCheckoutDto }>(response);
        if (controller.signal.aborted) return;
        setCheckout(result.checkout); setError(null);
        if (result.checkout.status !== "open") { resolvedRef.current(); return; }
      } catch (reason: unknown) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Unable to check this payment."); return;
      }
      if (Date.now() - started >= checkoutPollMaxMs) { setTimedOut(true); return; }
      timer = setTimeout(() => void poll(), checkoutPollMs);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId]);
  const status = checkout?.status;
  const good = status === "paid";
  const bad = status === "failed";
  const message = error ? error
    : !checkout || status === "open" ? (timedOut ? "We are still waiting for confirmation of your online payment. Reload this page in a moment to see the result." : "Confirming your online payment…")
    : status === "paid" ? (checkout.heldForReview ? "Payment received — the Billing Clerk will review it." : "Payment received — receipt available.")
    : status === "failed" ? `Payment failed: ${checkout.failureReason ?? "the payment could not be completed."}`
    : status === "cancelled" ? "Checkout cancelled." : "Checkout expired.";
  const Icon = good ? CircleCheck : bad || error ? CircleX : RefreshCw;
  return <div role="status" className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${bad || error ? "border-red-200 bg-red-50 text-red-800" : good ? "border-rose-200 bg-rose-50 text-stone-900" : "border-stone-200 bg-stone-50 text-stone-700"}`}>
    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${!checkout && !error ? "animate-spin" : ""}`} />
    <div className="min-w-0 flex-1"><p className="font-medium">{message}</p>
      {checkout && <p className="mt-1 text-xs text-stone-500">{checkout.invoiceNumber} · {formatPeso(checkout.amount)}</p>}
      {good && !checkout?.heldForReview && checkout?.billingPaymentId && <Link className="mt-2 inline-block text-sm font-semibold text-red-700 underline underline-offset-4" href={`/customer/receipts/${checkout.billingPaymentId}`}>View Receipt</Link>}
    </div>
    <button type="button" aria-label="Dismiss payment message" className="shrink-0 rounded-md p-1 text-stone-500 hover:bg-white/70" onClick={onDismiss}><X className="h-4 w-4" /></button>
  </div>;
}

function clearCheckoutParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("checkout")) return;
  url.searchParams.delete("checkout");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/** `reportView` picks the Reports tab: verified collections or outstanding invoices. */
export function BillingWorkspace({ section = "Dashboard", customer = false, reportView = "collections" }: { section?: BillingSection; customer?: boolean; reportView?: "collections" | "outstanding" }) {
  const [data, setData] = useState<BillingData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const linkedInvoiceOpened = useRef(false);
  const load = useCallback((signal?: AbortSignal) => {
    return fetch("/api/billing", { cache: "no-store", signal })
      .then((response) => billingJson<BillingData>(response))
      .then((result) => { if (!signal?.aborted) {
        setData(result); setError(null);
        if (customer && !linkedInvoiceOpened.current) {
          const params = new URLSearchParams(window.location.search);
          const invoice = result.invoices.find((item) => item.id === params.get("invoice"));
          if (invoice) setDialog({ type: "invoice", invoice });
          const returned = params.get("checkout");
          if (returned) setCheckoutId(returned);
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
  const checkoutResolved = useCallback(() => { clearCheckoutParam(); setLoading(true); void load(); }, [load]);
  const dismissCheckout = useCallback(() => { clearCheckoutParam(); setCheckoutId(null); }, []);
  const mutate: BillingMutation = async (url, method, body) => {
    await billingJson(await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    setSuccess("Record saved successfully.");
    setLoading(true);
    await load();
  };
  const query = search.trim().toLowerCase();
  const matches = (values: string[]) => !query || values.join(" ").toLowerCase().includes(query);
  const milestoneLabels = Object.fromEntries(data.projects.flatMap((project) => project.milestones.map((milestone) => [milestone.id, milestone.label])));
  const issued = data.invoices.filter((invoice) => !["Draft", "Void"].includes(invoice.status));
  const unpaid = issued.filter((invoice) => invoice.balance > 0);
  const overdue = unpaid.filter((invoice) => invoice.overdue);
  const pending = data.payments.filter((payment) => payment.status === "Pending");
  const month = manilaDate().slice(0, 7);
  const verified = data.payments.filter((payment) => payment.status === "Verified");
  const collectedThisMonth = sumMoney(verified.filter((payment) => manilaDate(new Date(payment.paidAt)).startsWith(month)).map((payment) => payment.amount));
  const filteredInvoices = data.invoices.filter((invoice) =>
    (!projectId || invoice.projectId === projectId) && (!status || (status === "Overdue" ? invoice.overdue : invoice.status === status)) &&
    matches([invoice.invoiceNumber, invoice.customerName, invoice.projectName, invoice.label]) &&
    (section === "Progress Billings" ? invoice.status === "Draft" : section !== "Invoices" || invoice.status !== "Draft"),
  );
  const filteredPayments = data.payments.filter((payment) =>
    (!projectId || payment.projectId === projectId) && (!status || payment.status === status) &&
    matches([payment.reference, payment.customerName, payment.invoiceNumber, payment.transactionReference, payment.receiptNumber ?? ""]),
  );
  const inRange = (date: string) => (!from || date >= from) && (!to || date <= to);
  const reportPayments = verified.filter((payment) => (!projectId || payment.projectId === projectId) && inRange(manilaDate(new Date(payment.paidAt))));
  const reportInvoices = unpaid.filter((invoice) => (!projectId || invoice.projectId === projectId) && inRange(invoice.dueDate));
  // Only checked rows that still match the report filters are exported.
  const exportPayments = reportPayments.filter((payment) => selectedPaymentIds.has(payment.id));
  const exportInvoices = reportInvoices.filter((invoice) => selectedInvoiceIds.has(invoice.id));
  const accounts = Array.from(new Map([...data.projects, ...data.invoices].map((item) => [item.customerId, { id: item.customerId, name: item.customerName }])).values())
    .map((account) => {
      const projects = data.projects.filter((project) => project.customerId === account.id);
      const invoices = issued.filter((invoice) => invoice.customerId === account.id);
      return { ...account, projects, billed: sumMoney(invoices.map((invoice) => invoice.amount)), paid: sumMoney(verified.filter((payment) => payment.customerId === account.id).map((payment) => payment.amount)), outstanding: sumMoney(invoices.map((invoice) => invoice.balance)) };
    }).filter((account) => matches([account.name, ...account.projects.map((project) => project.name)]) && (!projectId || account.projects.some((project) => project.id === projectId)));
  const exportReport = <Row,>(filename: string, sheetName: string, columns: XlsxColumn<Row>[], rows: Row[]) => {
    exportXlsx({ filename, sheetName, columns, rows }).catch(() => setError("Unable to create the Excel file. Try again."));
  };
  const close = () => setDialog(null);
  const viewInvoice = (invoice: BillingInvoice) => setDialog({ type: "invoice", invoice });
  const viewPayment = (payment: BillingPayment) => setDialog({ type: "payment", payment });
  // Issued invoices only; drafts stay on Progress Billings until they are issued.
  const invoiceStatuses = ["Sent", "Partially Paid", "Paid", "Overdue", "Void"];
  const paymentStatuses = ["Pending", "Verified", "Rejected", "Reversed"];

  // Reports sits inside the Reports tabs, which have their own heading and totals.
  const inReportTab = section === "Reports";
  return <div className="space-y-6">
    {/* Staff pages show the section title in the top bar and their action buttons on the table headings. */}
    {customer && <div className="flex flex-wrap items-start justify-between gap-4">
      {customer && <div><p className="text-xs font-semibold uppercase tracking-widest text-red-700">Customer Billing</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Your Invoices & Payments</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">Review your bills, submit payment details, and access receipts for verified payments.</p></div>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={loading || Boolean(error) || !unpaid.length} onClick={() => setDialog({ type: "payment-form" })}><Plus className="mr-2 h-4 w-4" />Submit Payment</Button>
      </div>
    </div>}
    {customer && checkoutId && <CheckoutReturnBanner key={checkoutId} sessionId={checkoutId} onResolved={checkoutResolved} onDismiss={dismissCheckout} />}
    <BillingErrorMessage message={error} />
    {success && <p role="status" className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">{success}</p>}
    {loading && <p role="status" className="text-sm text-stone-500">Loading billing records…</p>}
    {!error && !loading && <>
      {!customer && ["Dashboard", "Progress Billings"].includes(section) && data.designRequests.some((design) => !design.invoiceId) && <BillingPanel>
        <h2 className="text-lg font-semibold tracking-tight">Blueprints and Designs Awaiting Fee Invoice</h2><p className="mt-1 text-sm text-stone-600">These customers approved their design and the admin submitted the blueprint (or, for older requests, delivered the design). Prepare the agreed fee so the customer can pay and unlock their files.</p>
        <div className="mt-4 divide-y divide-stone-200">{data.designRequests.filter((design) => !design.invoiceId).map((design) => <div key={design.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{design.customerName}</p><p className="mt-1 text-xs text-stone-500">{designFeeLabels[design.feeType]} · {design.label}</p></div><Button variant="outline" onClick={() => setDialog({ type: "invoice-form", designRequestId: design.id })}>Prepare {designFeeLabels[design.feeType]}</Button></div>)}</div>
      </BillingPanel>}
      {!inReportTab && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(customer ? [
          { label: "Total Invoiced", value: formatPeso(sumMoney(issued.map((invoice) => invoice.amount))), note: "Construction, blueprint, and design fee invoices", icon: FileText },
          { label: "Verified Payments", value: formatPeso(sumMoney(verified.map((payment) => payment.amount))), note: "Confirmed payments only", icon: WalletCards },
          { label: "Outstanding Balance", value: formatPeso(sumMoney(unpaid.map((invoice) => invoice.balance))), note: "Unpaid portion of issued invoices", icon: ReceiptText },
          { label: "Awaiting Verification", value: String(pending.length), note: "Payment submissions under review", icon: Clock3 },
        ] : [
          { label: "Outstanding Balance", value: formatPeso(sumMoney(unpaid.map((invoice) => invoice.balance))), note: `${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"}`, icon: FileText },
          { label: "Collected This Month", value: formatPeso(collectedThisMonth), note: "Verified payments by payment date", icon: WalletCards },
          { label: "Payments to Review", value: String(pending.length), note: "Awaiting transaction confirmation", icon: ReceiptText },
          { label: "Overdue Invoices", value: String(overdue.length), note: `${formatPeso(sumMoney(overdue.map((invoice) => invoice.balance)))} outstanding`, icon: Clock3 },
        ]).map((metric) => <BillingPanel key={metric.label}><div className="flex items-start justify-between gap-2"><p className="text-sm text-stone-600">{metric.label}</p><metric.icon className="h-5 w-5 shrink-0 text-red-700" /></div><p className="mt-3 break-words text-2xl font-semibold tracking-tight">{metric.value}</p><p className="mt-2 text-xs text-stone-500">{metric.note}</p></BillingPanel>)}
      </div>}
      {!customer && section === "Dashboard" ? <>
        <BillingPanel><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">Payments Awaiting Verification</h2><Link className="text-sm font-semibold text-red-700" href="/billing-clerk/payments">View Payments</Link></div><PaymentTable payments={pending.slice(0, 5)} customer={false} onView={viewPayment} /></BillingPanel>
        <BillingPanel><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">Invoices Needing Follow-Up</h2><Link className="text-sm font-semibold text-red-700" href="/billing-clerk/invoices">View Invoices</Link></div><InvoiceTable invoices={[...unpaid].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5)} onView={viewInvoice} /></BillingPanel>
      </> : <>
        <BillingPanel>
          <div className="grid items-end gap-3 md:grid-cols-3">
            {section !== "Reports" && <label className="text-xs font-semibold text-stone-600"><span className="flex items-center gap-1"><Search className="h-3.5 w-3.5" />Search records</span><input type="search" className={field} placeholder="Customer, project or reference…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
            <label className="text-xs font-semibold text-stone-600">Project<select className={field} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All Projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.reference} · {project.name}</option>)}</select></label>
            {!customer && ["Invoices", "Payments"].includes(section) && <label className="text-xs font-semibold text-stone-600">Status<select className={field} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{(section === "Payments" ? paymentStatuses : invoiceStatuses).map((value) => <option key={value} value={value}>{value === "Sent" ? "Issued" : value}</option>)}</select></label>}
            {section === "Reports" && <><label className="text-xs font-semibold text-stone-600">From<input type="date" className={field} max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-semibold text-stone-600">To<input type="date" className={field} min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></label></>}
          </div>
        </BillingPanel>
        {(customer || ["Progress Billings", "Invoices"].includes(section)) && <BillingPanel><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">{section === "Progress Billings" && !customer ? "Drafts to issue" : "Invoices"}</h2>{!customer && section === "Progress Billings" && <Button onClick={() => setDialog({ type: "invoice-form" })}><Plus className="mr-2 h-4 w-4" />Prepare billing</Button>}</div><InvoiceTable key={search + projectId + status} invoices={filteredInvoices} milestoneLabels={milestoneLabels} onView={viewInvoice} />{!data.projects.length && !data.invoices.length && !data.designRequests.length && <p className="mt-4 text-sm text-stone-600">{customer ? "Your project and invoices will appear here when they are ready." : "Prepare billing for an agreed construction contract or an admin-delivered design request."}</p>}</BillingPanel>}
        {(customer || section === "Payments") && <BillingPanel><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">Payment History & Receipts</h2>{!customer && <Button disabled={!unpaid.length} onClick={() => setDialog({ type: "payment-form" })}><Plus className="mr-2 h-4 w-4" />Record Payment</Button>}</div><PaymentTable key={search + projectId + status} payments={filteredPayments} customer={customer} onView={viewPayment} /></BillingPanel>}
        {section === "Customer Accounts" && <BillingPanel><h2 className="mb-5 text-lg font-semibold tracking-tight">Customer Balances</h2>{!accounts.length ? <BillingEmpty /> : <div className="divide-y divide-stone-200">{accounts.map((account) => <div key={account.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><p className="font-semibold">{account.name}</p><p className="mt-1 text-xs text-stone-500">{account.projects.length} projects · {formatPeso(account.billed)} invoiced · {formatPeso(account.paid)} paid</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="font-semibold text-red-700">{formatPeso(account.outstanding)}</p><p className="text-xs text-stone-500">Outstanding</p></div><Button variant="outline" onClick={() => setDialog({ type: "account", customerId: account.id, customerName: account.name })}>View Account</Button></div></div>)}</div>}</BillingPanel>}
        {section === "Reports" && <>
          <p className="text-sm text-stone-600">{reportView === "collections" ? "Collections use the payment date and currently verified payments. Pending, rejected, and reversed payments are excluded." : "Outstanding invoices use their due date and current balance."} Check the rows you want, then use Export Selected.</p>
          {reportView === "collections" && <BillingPanel><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Verified Collections</h2><p className="mt-1 text-sm text-stone-600">{reportPayments.length} payments · <strong>{formatPeso(sumMoney(reportPayments.map((payment) => payment.amount)))}</strong></p></div><Button variant="outline" disabled={!exportPayments.length || Boolean(from && to && from > to)} onClick={() => exportReport("g4-collections.xlsx", "Verified Collections", collectionColumns, exportPayments)}><Download className="mr-2 h-4 w-4" />{exportPayments.length ? `Export Selected (${exportPayments.length})` : "Select Rows to Export"}</Button></div>
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{paymentMethods.map((method) => <div className="rounded-lg bg-stone-50 p-3" key={method}><p className="text-xs text-stone-500">{method}</p><p className="mt-2 font-semibold">{formatPeso(sumMoney(reportPayments.filter((payment) => payment.method === method).map((payment) => payment.amount)))}</p></div>)}</div>
            <PaymentTable key={from + to + projectId} payments={reportPayments} customer={false} onView={viewPayment} selection={{ selected: selectedPaymentIds, onChange: setSelectedPaymentIds }} />
          </BillingPanel>}
          {reportView === "outstanding" && <BillingPanel><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Outstanding Invoices</h2><p className="mt-1 text-sm text-stone-600">{reportInvoices.length} invoices · <strong>{formatPeso(sumMoney(reportInvoices.map((invoice) => invoice.balance)))}</strong></p></div><Button variant="outline" disabled={!exportInvoices.length || Boolean(from && to && from > to)} onClick={() => exportReport("g4-outstanding-invoices.xlsx", "Outstanding Invoices", outstandingColumns, exportInvoices)}><Download className="mr-2 h-4 w-4" />{exportInvoices.length ? `Export Selected (${exportInvoices.length})` : "Select Rows to Export"}</Button></div><InvoiceTable key={from + to + projectId} invoices={reportInvoices} onView={viewInvoice} selection={{ selected: selectedInvoiceIds, onChange: setSelectedInvoiceIds }} /></BillingPanel>}
        </>}
      </>}
    </>}
    {dialog?.type === "invoice-form" && <InvoiceForm projects={data.projects} designRequests={data.designRequests} designRequestId={dialog.designRequestId} invoice={dialog.invoice} mutate={mutate} onClose={close} />}
    {dialog?.type === "payment-form" && <PaymentForm invoices={data.invoices} selectedInvoice={dialog.invoice} customer={customer} mutate={mutate} onClose={close} />}
    {dialog?.type === "pay-online" && <PayOnlineDialog invoice={dialog.invoice} onClose={close} />}
    {dialog?.type === "invoice-action" && <InvoiceActionDialog invoice={dialog.invoice} action={dialog.action} mutate={mutate} onClose={close} />}
    {dialog?.type === "payment" && <PaymentReview payment={dialog.payment} customer={customer} mutate={mutate} onClose={close} />}
    {dialog?.type === "invoice" && <BillingDialog title={dialog.invoice.invoiceNumber} onClose={close}>
      <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-semibold">{dialog.invoice.label}</h3><p className="mt-1 text-sm text-stone-600">{dialog.invoice.customerName}</p><p className="mt-1 text-xs text-stone-500">{dialog.invoice.projectName}</p></div><BillingBadge status={dialog.invoice.status} /></div>
        <div className="grid gap-3 rounded-lg bg-stone-50 p-4 sm:grid-cols-3">{[["Invoice amount", dialog.invoice.amount], ["Verified paid", dialog.invoice.paid], ["Remaining balance", dialog.invoice.balance]].map(([label, value]) => <div key={label}><p className="text-xs text-stone-500">{label}</p><p className="mt-1 font-semibold">{dialog.invoice.status === "Void" && label === "Remaining balance" ? "—" : formatPeso(Number(value))}</p></div>)}</div>
        <p className="text-sm text-stone-600">Due {billingDate(dialog.invoice.dueDate)}{dialog.invoice.designRequestId ? ` · ${designFeeLabels[dialog.invoice.feeType ?? "design"]}` : " · Project progress: " + dialog.invoice.progressPercentage + "%"}{dialog.invoice.overdue ? " · Overdue balance" : ""}</p>
        <div><p className="text-sm font-semibold">Billing Basis</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">{dialog.invoice.basis || "No reference recorded. Add the billing basis before issuing."}</p></div>
        {dialog.invoice.voidReason && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Void reason: {dialog.invoice.voidReason}</p>}
        <div className="flex flex-wrap gap-2">
          {customer && dialog.invoice.designRequestId && <Button asChild><Link href={`/customer/dream-house?design=${encodeURIComponent(dialog.invoice.designRequestId)}`}>Open Dream House</Link></Button>}
          <Button variant="outline" asChild><a target="_blank" rel="noreferrer" href={`/${customer ? "customer" : "billing-clerk"}/invoices/${dialog.invoice.id}`}>Print / Download Invoice</a></Button>
          {!customer && dialog.invoice.status === "Draft" && <><Button variant="outline" onClick={() => setDialog({ type: "invoice-form", invoice: dialog.invoice })}>Edit draft</Button><Button onClick={() => setDialog({ type: "invoice-action", invoice: dialog.invoice, action: "issue" })}>Issue invoice</Button></>}
          {!["Draft", "Void"].includes(dialog.invoice.status) && dialog.invoice.balance > 0 && <>{customer && <Button onClick={() => setDialog({ type: "pay-online", invoice: dialog.invoice })}><Smartphone className="mr-2 h-4 w-4" />Pay online</Button>}<Button variant={customer ? "outline" : "default"} onClick={() => setDialog({ type: "payment-form", invoice: dialog.invoice })}>{customer ? "Submit payment" : "Record payment"}</Button>{!customer && <Button variant="outline" onClick={() => setDialog({ type: "invoice-action", invoice: dialog.invoice, action: "remind" })}>Send reminder</Button>}</>}
          {!customer && dialog.invoice.status !== "Void" && <Button variant="ghost" onClick={() => setDialog({ type: "invoice-action", invoice: dialog.invoice, action: "void" })}>Void invoice</Button>}
        </div>
        <div className="border-t border-stone-200 pt-4"><h3 className="mb-4 font-semibold">Payments for This Invoice</h3><div className="px-5"><PaymentTable payments={data.payments.filter((payment) => payment.invoiceId === dialog.invoice.id)} customer={customer} onView={viewPayment} /></div></div>
      </div>
    </BillingDialog>}
    {dialog?.type === "account" && <BillingDialog title={dialog.customerName} onClose={close}><div className="space-y-5">
      {data.projects.filter((project) => project.customerId === dialog.customerId).map((project) => <div key={project.id} className="rounded-lg border border-stone-200 p-4"><p className="font-semibold">{project.reference} · {project.name}</p><p className="mt-2 text-sm text-stone-600">Contract {formatPeso(project.contractPrice)} · Invoiced {formatPeso(project.billed)}</p><p className="mt-1 text-sm text-stone-600">Verified payments {formatPeso(project.paid)} · Outstanding {formatPeso(project.outstanding)}</p></div>)}
      <h3 className="font-semibold">Invoice History</h3><div className="px-5"><InvoiceTable invoices={data.invoices.filter((invoice) => invoice.customerId === dialog.customerId)} milestoneLabels={milestoneLabels} onView={viewInvoice} /></div>
      <h3 className="font-semibold">Payment History</h3><div className="px-5"><PaymentTable payments={data.payments.filter((payment) => payment.customerId === dialog.customerId)} customer={false} onView={viewPayment} /></div>
    </div></BillingDialog>}
  </div>;
}
