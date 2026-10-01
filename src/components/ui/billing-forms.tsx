"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/components/ui/house-design-data";
import { BillingBadge, BillingDialog, BillingErrorMessage, billingDate, billingFieldClass as field } from "@/components/ui/billing-primitives";
import { embeddedImageAccept, readEmbeddedImage } from "@/lib/client-image-upload";
import { manilaDate } from "@/lib/billing";
import { paymentMethods, type BillingData, type BillingInvoice, type BillingPayment, type BillingProject, type PaymentMethod } from "@/types/billing";

export type BillingMutation = (url: string, method: "POST" | "PATCH", body: unknown) => Promise<void>;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to save this record.";

export function InvoiceForm({ projects, designRequests, designRequestId, invoice, mutate, onClose }: {
  projects: BillingProject[]; designRequests: BillingData["designRequests"]; designRequestId?: string; invoice?: BillingInvoice; mutate: BillingMutation; onClose: () => void;
}) {
  const [form, setForm] = useState({
    projectId: invoice?.projectId ?? "", designRequestId: invoice?.designRequestId ?? designRequestId ?? "", label: invoice?.label ?? (designRequestId ? "House design fee" : ""), basis: invoice?.basis ?? "",
    progressPercentage: String(invoice?.progressPercentage ?? 0), amount: invoice ? String(invoice.amount) : "", dueDate: invoice?.dueDate ?? manilaDate(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = projects.find((item) => item.id === form.projectId);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const { projectId, designRequestId, ...fields } = form;
    const input = { ...fields, ...(designRequestId ? { designRequestId } : { projectId }), amount: Number(form.amount), progressPercentage: designRequestId ? 0 : Number(form.progressPercentage) };
    try {
      await mutate(invoice ? `/api/billing/invoices/${invoice.id}` : "/api/billing/invoices", invoice ? "PATCH" : "POST", invoice ? { action: "edit", invoice: input } : input);
      onClose();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <BillingDialog title={invoice ? "Edit draft billing" : "Prepare billing"} onClose={onClose} busy={busy}>
    <form onSubmit={submit} className="space-y-4">
      <BillingErrorMessage message={error} />
      <label className="block text-sm font-medium">Billing for
        <select disabled={busy || Boolean(invoice)} className={field} value={form.designRequestId ? "design" : "project"} onChange={(event) => { setForm({ ...form, projectId: "", designRequestId: event.target.value === "design" ? (designRequests.find((item) => !item.invoiceId)?.id ?? "") : "", label: event.target.value === "design" ? "House design fee" : "" }); }}>
          <option value="project">Construction progress</option><option value="design" disabled={!designRequests.some((item) => !item.invoiceId || item.id === invoice?.designRequestId)}>Completed design fee</option>
        </select>
      </label>
      {form.designRequestId ? <label className="block text-sm font-medium">Customer / completed design request
        <select required disabled={busy || Boolean(invoice)} className={field} value={form.designRequestId} onChange={(event) => setForm({ ...form, designRequestId: event.target.value })}>
          {designRequests.filter((item) => !item.invoiceId || item.id === invoice?.designRequestId).map((item) => <option key={item.id} value={item.id}>{item.customerName} — {item.label}</option>)}
        </select>
        <p className="mt-2 text-xs font-normal leading-5 text-stone-500">Use the agreed design fee. Full verified payment unlocks this request only. This fee is separate from the construction contract.</p>
      </label> : <label className="block text-sm font-medium">Customer / project
        <select required disabled={busy || Boolean(invoice)} className={field} value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
          <option value="">Select an active project</option>
          {projects.filter((item) => ["Active", "Completed"].includes(item.status)).map((item) => <option key={item.id} value={item.id}>{item.customerName} — {item.reference} · {item.name}</option>)}
        </select>
      </label>}
      {project && <div className="rounded-lg bg-rose-50 p-3 text-sm text-stone-600">
        Contract: <strong className="text-stone-950">{formatPeso(project.contractPrice)}</strong> · Available to bill, including drafts: <strong className="text-stone-950">{formatPeso(project.contractPrice - project.allocated + (invoice?.amount ?? 0))}</strong>
      </div>}
      <label className="block text-sm font-medium">Billing stage
        <input required minLength={3} maxLength={160} className={field} placeholder="e.g. Second billing — foundation work" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
      </label>
      <label className="block text-sm font-medium">Billing basis / approved reference
        <textarea required minLength={5} maxLength={2000} rows={3} className={field} placeholder="Reference the signed payment schedule or approved accomplishment report and describe the work covered." value={form.basis} onChange={(event) => setForm({ ...form, basis: event.target.value })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">Amount (PHP)<input required type="number" min="0.01" max="1000000000" step="0.01" className={field} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
        {!form.designRequestId && <label className="text-sm font-medium">Project progress (%)<input required type="number" min="0" max="100" step="0.01" className={field} value={form.progressPercentage} onChange={(event) => setForm({ ...form, progressPercentage: event.target.value })} /></label>}
        <label className="text-sm font-medium">Due date<input required type="date" className={field} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
      </div>
      <p className="text-xs leading-5 text-stone-500">Use the agreed fee or approved contract as your basis. Review the saved draft before issuing it to the customer.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || (!project && !form.designRequestId)}>{busy ? "Saving…" : "Save draft"}</Button></div>
    </form>
  </BillingDialog>;
}

export function PaymentForm({ invoices, selectedInvoice, customer, mutate, onClose }: {
  invoices: BillingInvoice[]; selectedInvoice?: BillingInvoice; customer: boolean; mutate: BillingMutation; onClose: () => void;
}) {
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    invoiceId: selectedInvoice?.id ?? "", amount: "", method: (customer ? "Bank transfer" : "Cash") as PaymentMethod,
    transactionReference: "", paidAt: manilaDate(), notes: "", proofImage: "",
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payable = invoices.filter((invoice) => !["Draft", "Ready", "Void"].includes(invoice.status) && invoice.balance > 0);
  const invoice = payable.find((item) => item.id === form.invoiceId);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      await mutate("/api/billing/payments", "POST", { ...form, amount: Number(form.amount), submissionKey, proofImage: form.proofImage || undefined });
      onClose();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <BillingDialog title={customer ? "Submit payment details" : "Record customer payment"} onClose={onClose} busy={busy || uploading}>
    <form onSubmit={submit} className="space-y-4">
      <BillingErrorMessage message={error} />
      <label className="block text-sm font-medium">Invoice<select required className={field} value={form.invoiceId} onChange={(event) => setForm({ ...form, invoiceId: event.target.value })}>
        <option value="">Select an unpaid invoice</option>{payable.map((item) => <option key={item.id} value={item.id}>{item.invoiceNumber} — {item.customerName} · {item.label}</option>)}
      </select></label>
      {invoice && <p className="rounded-lg bg-rose-50 p-3 text-sm">Remaining invoice balance: <strong>{formatPeso(invoice.balance)}</strong></p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Amount paid (PHP)<input required type="number" min="0.01" max={invoice?.balance ?? 1000000000} step="0.01" value={form.amount} className={field} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
        <label className="text-sm font-medium">Payment method<select value={form.method} className={field} onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}>
          {paymentMethods.filter((method) => !customer || method !== "Cash").map((method) => <option key={method}>{method}</option>)}
        </select></label>
        <label className="text-sm font-medium">Payment date<input required type="date" max={manilaDate()} value={form.paidAt} className={field} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} /></label>
        <label className="text-sm font-medium">Transaction reference {form.method === "Cash" ? "(optional)" : ""}<input required={form.method !== "Cash"} minLength={form.method === "Cash" ? undefined : 3} maxLength={120} value={form.transactionReference} className={field} onChange={(event) => setForm({ ...form, transactionReference: event.target.value })} /></label>
      </div>
      <label className="block text-sm font-medium">Payment proof (optional, JPG / PNG / WebP, up to 750 KB)
        <input type="file" accept={embeddedImageAccept} disabled={busy || uploading} className={field} onChange={async (event) => {
          const file = event.target.files?.[0];
          setError(null); setForm((previous) => ({ ...previous, proofImage: "" }));
          if (!file) return;
          setUploading(true);
          try { const proofImage = await readEmbeddedImage(file); setForm((previous) => ({ ...previous, proofImage })); }
          catch (error) { setError(errorText(error)); event.target.value = ""; }
          finally { setUploading(false); }
        }} />
      </label>
      {form.proofImage && <p className="text-xs text-stone-600">Payment proof attached.</p>}
      <label className="block text-sm font-medium">Notes (optional)<textarea rows={2} maxLength={1000} value={form.notes} className={field} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <p className="text-xs leading-5 text-stone-500">This records a payment made through the selected method. The Billing Clerk will verify the actual transaction before the balance changes and a receipt becomes available.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy || uploading} onClick={onClose}>Cancel</Button><Button disabled={busy || uploading || !invoice}>{busy ? "Submitting…" : uploading ? "Attaching…" : "Submit for verification"}</Button></div>
    </form>
  </BillingDialog>;
}

export function InvoiceActionDialog({ invoice, action, mutate, onClose }: {
  invoice: BillingInvoice; action: "issue" | "void" | "remind"; mutate: BillingMutation; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = action === "issue" ? "Issue invoice" : action === "void" ? "Void invoice" : "Send payment reminder";
  return <BillingDialog title={label} onClose={onClose} busy={busy}>
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(null);
      try { await mutate(`/api/billing/invoices/${invoice.id}`, "PATCH", { action, ...(action === "void" ? { reason } : {}) }); onClose(); }
      catch (error) { setError(errorText(error)); } finally { setBusy(false); }
    }}>
      <BillingErrorMessage message={error} />
      <p className="font-semibold">{invoice.invoiceNumber} · {invoice.customerName}</p>
      <p className="text-sm text-stone-600">{invoice.label} · {formatPeso(invoice.amount)} · Due {billingDate(invoice.dueDate)}</p>
      <p className="text-sm leading-6 text-stone-600">{action === "issue" ? "The customer will receive this invoice in their Billing page. Check the billing basis, amount, and due date before releasing it. Issued invoices cannot be edited." : action === "void" ? "This record will remain in the history as void. Pending and verified payments must be resolved first." : "Send an in-app reminder to this customer. Only one reminder per invoice is allowed every 24 hours."}</p>
      {action === "void" && <label className="block text-sm font-medium">Reason<textarea required minLength={5} maxLength={1000} rows={3} className={field} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : label}</Button></div>
    </form>
  </BillingDialog>;
}

export function PaymentReview({ payment, customer, mutate, onClose }: {
  payment: BillingPayment; customer: boolean; mutate: BillingMutation; onClose: () => void;
}) {
  const [action, setAction] = useState<"verify" | "reject" | "reverse">(payment.status === "Verified" ? "reverse" : "verify");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = !customer && ["Pending", "Verified"].includes(payment.status) && Boolean(payment.invoiceId);
  return <BillingDialog title={customer ? "Payment details" : "Review payment"} onClose={onClose} busy={busy}>
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(null);
      try { await mutate(`/api/billing/payments/${payment.id}`, "PATCH", { action, ...(action !== "verify" ? { reason } : {}) }); onClose(); }
      catch (error) { setError(errorText(error)); } finally { setBusy(false); }
    }}>
      <BillingErrorMessage message={error} />
      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{payment.reference}</p><p className="mt-1 text-sm text-stone-600">{payment.customerName} · {payment.invoiceNumber}</p></div><BillingBadge status={payment.status} /></div>
      <div className="rounded-lg bg-stone-50 p-4"><p className="text-2xl font-semibold tracking-tight">{formatPeso(payment.amount)}</p><p className="mt-2 text-sm text-stone-600">{payment.method} · {billingDate(payment.paidAt)}</p><p className="mt-1 break-all text-sm">Reference: {payment.transactionReference || "Cash collection"}</p></div>
      {payment.notes && <p className="whitespace-pre-wrap text-sm text-stone-600">{payment.notes}</p>}
      {payment.hasProof && <div><p className="mb-2 text-sm font-medium">Submitted proof</p><a href={`/api/billing/payments/${payment.id}/proof`} target="_blank" rel="noreferrer" className="text-sm text-red-700 underline">Open full image</a><Image unoptimized src={`/api/billing/payments/${payment.id}/proof`} alt="Submitted payment proof" width={600} height={400} className="mt-3 max-h-80 w-full rounded-lg border border-stone-200 object-contain" /></div>}
      {payment.reviewNote && <p className="text-sm text-red-800">Review note: {payment.reviewNote}</p>}
      {payment.reversalReason && <p className="text-sm text-red-800">Reversal reason: {payment.reversalReason}</p>}
      {payment.receiptNumber && <Button asChild variant="outline"><a target="_blank" rel="noreferrer" href={`/${customer ? "customer" : "billing-clerk"}/receipts/${payment.id}`}>View receipt {payment.receiptNumber}</a></Button>}
      {editable && <>
        {payment.status === "Pending" && <label className="block text-sm font-medium">Decision<select className={field} value={action} onChange={(event) => { setAction(event.target.value as "verify" | "reject"); setConfirmed(false); }}><option value="verify">Verify payment and issue receipt</option><option value="reject">Reject payment</option></select></label>}
        {action !== "verify" ? <label className="block text-sm font-medium">{action === "reverse" ? "Reason for reversal" : "Reason for rejection"}<textarea required minLength={5} maxLength={1000} className={field} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}
        <label className="flex items-start gap-3 rounded-lg border border-stone-200 p-3 text-sm leading-6"><input required type="checkbox" className="mt-1 accent-red-700" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{action === "verify" ? "I have confirmed the actual payment, amount, and transaction reference. A screenshot alone is not confirmation." : action === "reverse" ? "Reverse this verified payment, restore the invoice balance, and mark its receipt void. The original receipt and history will be retained." : "I have reviewed this submission and recorded the reason for rejection."}</span></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !confirmed}>{busy ? "Saving…" : action === "verify" ? "Verify & issue receipt" : action === "reject" ? "Reject payment" : "Reverse payment"}</Button></div>
      </>}
    </form>
  </BillingDialog>;
}
