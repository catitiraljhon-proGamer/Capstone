"use client";

import { useId, useState, type FormEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { PesoInput } from "@/components/ui/peso-input";
import { FieldError } from "@/components/ui/field-error";
import { amountError, dateError, manilaDay, numberError, textError } from "@/lib/form-validation";
import { formatPeso } from "@/lib/house-design-data";
import { BillingBadge, BillingDialog, BillingErrorMessage, billingDate, billingFieldClass as field, billingJson } from "@/components/billing/billing-primitives";
import { GatewayPills } from "@/components/billing/billing-tables";
import { embeddedImageAccept, readEmbeddedImage } from "@/lib/client-image-upload";
import { manilaDate } from "@/lib/billing";
import type { PaymentMilestoneDto } from "@/types/construction";
import { PAYMONGO_MIN_AMOUNT, type CreateCheckoutInput, type PaymongoCheckoutDto } from "@/types/paymongo";
import { paymentMethods, type BillingData, type BillingInvoice, type BillingPayment, type BillingProject, type PaymentMethod } from "@/types/billing";

export type BillingMutation = (url: string, method: "POST" | "PATCH", body: unknown) => Promise<void>;
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to save this record.";
const downpaymentBasis = "Downpayment per accepted cost estimate";
const billableStatuses = ["Awaiting downpayment", "Scheduled", "Active", "Completed"];
const roundPercent = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const invalidField = `${field} aria-invalid:border-red-600`;

/**
 * Inline validation for a form: messages show once a field was touched (blurred) or a submit was attempted,
 * so a pristine form never nags. `props` wires an input to its message, `error` renders it, and `blocked`
 * stops a submit while focusing the first invalid field. Submit buttons stay enabled so the reason is always visible.
 */
function useFieldMessages() {
  const prefix = useId();
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const visible = (name: string, message: string | null) => (submitted || touched[name] ? message : null);
  return {
    props(name: string, message: string | null) {
      const id = `${prefix}-${name}`;
      const shown = visible(name, message);
      return { id, "aria-invalid": Boolean(shown), "aria-describedby": shown ? `${id}-error` : undefined, onBlur: () => setTouched((previous) => previous[name] ? previous : { ...previous, [name]: true }) };
    },
    error: (name: string, message: string | null) => <FieldError id={`${prefix}-${name}-error`} message={visible(name, message)} />,
    /** Records the submit attempt; returns true (after focusing the first invalid field) when the form must not be sent. */
    blocked(messages: Record<string, string | null>) {
      setSubmitted(true);
      const first = Object.entries(messages).find(([, message]) => message);
      if (!first) return false;
      document.getElementById(`${prefix}-${first[0]}`)?.focus();
      return true;
    },
  };
}

/** Milestones the clerk may still bill: no non-void invoice yet, and only the downpayment while awaiting it. */
function billableMilestones(project: BillingProject | undefined, currentMilestoneId?: string) {
  if (!project) return [];
  return project.milestones.filter((milestone) =>
    (milestone.id === currentMilestoneId || !milestone.invoice) && (project.status !== "Awaiting downpayment" || milestone.isDownpayment));
}

/** Form values implied by a milestone: label, exact amount, cumulative progress, and a due date that is not in the past. */
function milestoneFields(project: BillingProject, milestone: PaymentMilestoneDto) {
  const index = project.milestones.findIndex((item) => item.id === milestone.id);
  const progress = project.milestones.slice(0, index + 1).reduce((sum, item) => sum + item.percentage, 0);
  const today = manilaDate();
  return {
    label: milestone.label, amount: String(milestone.amount), progressPercentage: String(Math.min(100, roundPercent(progress))),
    dueDate: milestone.targetDate && milestone.targetDate >= today ? milestone.targetDate : manilaDate(new Date(Date.now() + 7 * 86_400_000)),
  };
}

export function InvoiceForm({ projects, designRequests, designRequestId, invoice, mutate, onClose }: {
  projects: BillingProject[]; designRequests: BillingData["designRequests"]; designRequestId?: string; invoice?: BillingInvoice; mutate: BillingMutation; onClose: () => void;
}) {
  const [form, setForm] = useState({
    projectId: invoice?.projectId ?? "", designRequestId: invoice?.designRequestId ?? designRequestId ?? "", milestoneId: invoice?.milestoneId ?? "", label: invoice?.label ?? (designRequestId ? "House design fee" : ""), basis: invoice?.basis ?? "",
    progressPercentage: String(invoice?.progressPercentage ?? 0), amount: invoice ? String(invoice.amount) : "", dueDate: invoice?.dueDate ?? manilaDate(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = projects.find((item) => item.id === form.projectId);
  const hasMilestones = !form.designRequestId && Boolean(project?.milestones.length);
  const availableMilestones = hasMilestones ? billableMilestones(project, invoice?.milestoneId) : [];
  const milestone = hasMilestones ? project?.milestones.find((item) => item.id === form.milestoneId) : undefined;
  const fields = useFieldMessages();
  const remaining = project ? Math.round((project.contractPrice - project.allocated + (invoice?.amount ?? 0)) * 100) / 100 : undefined;
  // Milestone amount and progress are fixed by the accepted payment schedule, so only free-entry values are checked.
  const messages = {
    project: !form.designRequestId && !project ? "Choose the customer / project to bill." : null,
    milestone: hasMilestones && !milestone ? "Choose the milestone to bill." : null,
    label: textError(form.label, { label: "Billing stage", min: 3, max: 160 }),
    basis: textError(form.basis, { label: "Billing basis", min: 5, max: 2000 }),
    amount: milestone ? null : amountError(form.amount, { label: "Amount", max: form.designRequestId ? undefined : remaining, maxLabel: "the remaining contract amount" }),
    progress: form.designRequestId || milestone ? null : numberError(form.progressPercentage, { label: "Project progress", min: 0, max: 100, unit: "%", maxDecimals: 2 }),
    dueDate: dateError(form.dueDate, { label: "Due date", min: manilaDay(), minLabel: "today" }),
  };
  function chooseProject(projectId: string) {
    const next = projects.find((item) => item.id === projectId);
    const first = next?.milestones.length ? billableMilestones(next)[0] : undefined;
    setForm({ ...form, projectId, milestoneId: first?.id ?? "", ...(next && first ? { ...milestoneFields(next, first), basis: first.isDownpayment && !form.basis ? downpaymentBasis : form.basis } : {}) });
  }
  function chooseMilestone(milestoneId: string) {
    const picked = project?.milestones.find((item) => item.id === milestoneId);
    if (!project || !picked) { setForm({ ...form, milestoneId }); return; }
    setForm({ ...form, milestoneId, ...milestoneFields(project, picked), basis: picked.isDownpayment ? (form.basis || downpaymentBasis) : (form.basis === downpaymentBasis ? "" : form.basis) });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fields.blocked(messages)) return;
    setBusy(true); setError(null);
    const { projectId, designRequestId, milestoneId, ...values } = form;
    const input = { ...values, ...(designRequestId ? { designRequestId } : { projectId }), ...(hasMilestones ? { milestoneId } : {}), amount: Number(form.amount), progressPercentage: designRequestId ? 0 : Number(form.progressPercentage) };
    try {
      await mutate(invoice ? `/api/billing/invoices/${invoice.id}` : "/api/billing/invoices", invoice ? "PATCH" : "POST", invoice ? { action: "edit", invoice: input } : input);
      onClose();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <BillingDialog title={invoice ? "Edit draft billing" : "Prepare billing"} onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate className="space-y-4">
      <BillingErrorMessage message={error} />
      <label className="block text-sm font-medium">Billing for
        <select disabled={busy || Boolean(invoice)} className={field} value={form.designRequestId ? "design" : "project"} onChange={(event) => { setForm({ ...form, projectId: "", milestoneId: "", designRequestId: event.target.value === "design" ? (designRequests.find((item) => !item.invoiceId)?.id ?? "") : "", label: event.target.value === "design" ? "House design fee" : "" }); }}>
          <option value="project">Construction progress</option><option value="design" disabled={!designRequests.some((item) => !item.invoiceId || item.id === invoice?.designRequestId)}>Completed design fee</option>
        </select>
      </label>
      {form.designRequestId ? <label className="block text-sm font-medium">Customer / completed design request
        <select required disabled={busy || Boolean(invoice)} className={field} value={form.designRequestId} onChange={(event) => setForm({ ...form, designRequestId: event.target.value })}>
          {designRequests.filter((item) => !item.invoiceId || item.id === invoice?.designRequestId).map((item) => <option key={item.id} value={item.id}>{item.customerName} — {item.label}</option>)}
        </select>
        <p className="mt-2 text-xs font-normal leading-5 text-stone-500">Use the agreed design fee. Full verified payment unlocks this request only. This fee is separate from the construction contract.</p>
      </label> : <div><label className="block text-sm font-medium">Customer / project
        <select required disabled={busy || Boolean(invoice)} className={invalidField} {...fields.props("project", messages.project)} value={form.projectId} onChange={(event) => chooseProject(event.target.value)}>
          <option value="">Select a project</option>
          {projects.filter((item) => billableStatuses.includes(item.status) || item.id === invoice?.projectId).map((item) => <option key={item.id} value={item.id}>{item.customerName} — {item.reference} · {item.name}</option>)}
        </select>
      </label>{fields.error("project", messages.project)}</div>}
      {project && <div className="rounded-lg bg-rose-50 p-3 text-sm text-stone-600">
        Contract: <strong className="text-stone-950">{formatPeso(project.contractPrice)}</strong> · Available to bill, including drafts: <strong className="text-stone-950">{formatPeso(project.contractPrice - project.allocated + (invoice?.amount ?? 0))}</strong>
      </div>}
      {hasMilestones && <div><label className="block text-sm font-medium">Billing milestone
        <select required disabled={busy || Boolean(invoice)} className={invalidField} {...fields.props("milestone", messages.milestone)} value={form.milestoneId} onChange={(event) => chooseMilestone(event.target.value)}>
          <option value="">{availableMilestones.length ? "Select a milestone to bill" : "No milestone available to bill"}</option>
          {availableMilestones.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.percentage}% · {formatPeso(item.amount)}</option>)}
        </select>
        <p className="mt-2 text-xs font-normal leading-5 text-stone-500">{project?.status === "Awaiting downpayment" ? "Only the downpayment can be billed until it is paid and the project is scheduled." : "Each milestone is billed once, for the exact amount in the accepted payment schedule."}</p>
      </label>{fields.error("milestone", messages.milestone)}</div>}
      <div><label className="block text-sm font-medium">Billing stage
        <input required maxLength={160} className={invalidField} {...fields.props("label", messages.label)} placeholder="e.g. Second billing — foundation work" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
      </label>{fields.error("label", messages.label)}</div>
      <div><label className="block text-sm font-medium">Billing basis / approved reference
        <textarea required maxLength={2000} rows={3} className={invalidField} {...fields.props("basis", messages.basis)} placeholder="Reference the signed payment schedule or approved accomplishment report and describe the work covered." value={form.basis} onChange={(event) => setForm({ ...form, basis: event.target.value })} />
      </label>{fields.error("basis", messages.basis)}</div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="text-sm font-medium">Amount (PHP)<PesoInput required readOnly={Boolean(milestone)} min="0.01" max="1000000000" step="0.01" wrapperClassName="mt-1.5" {...fields.props("amount", messages.amount)} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>{fields.error("amount", messages.amount)}</div>
        {!form.designRequestId && <div><label className="text-sm font-medium">Project progress (%)<input required readOnly={Boolean(milestone)} type="number" min="0" max="100" step="0.01" className={invalidField} {...fields.props("progress", messages.progress)} value={form.progressPercentage} onChange={(event) => setForm({ ...form, progressPercentage: event.target.value })} /></label>{fields.error("progress", messages.progress)}</div>}
        <div><label className="text-sm font-medium">Due date<input required type="date" className={invalidField} {...fields.props("dueDate", messages.dueDate)} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>{fields.error("dueDate", messages.dueDate)}</div>
      </div>
      <p className="text-xs leading-5 text-stone-500">Use the agreed fee or approved contract as your basis. Review the saved draft before issuing it to the customer.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save draft"}</Button></div>
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
  const [proofError, setProofError] = useState<string | null>(null);
  const fields = useFieldMessages();
  const payable = invoices.filter((invoice) => !["Draft", "Ready", "Void"].includes(invoice.status) && invoice.balance > 0);
  const invoice = payable.find((item) => item.id === form.invoiceId);
  const cash = form.method === "Cash";
  const messages = {
    invoice: invoice ? null : "Choose the invoice you are paying.",
    amount: amountError(form.amount, { label: "Amount", max: invoice?.balance, maxLabel: "the remaining invoice balance" }),
    method: customer && cash ? "Cash payments must be recorded by the Billing Clerk. Choose another payment method." : null,
    paidAt: dateError(form.paidAt, { label: "Payment date", max: manilaDay(), maxLabel: "today" }),
    transactionReference: cash
      ? textError(form.transactionReference, { label: "Transaction reference", required: false, max: 120 })
      : textError(form.transactionReference, { label: "Transaction reference", min: 3, max: 120 }),
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fields.blocked(messages)) return;
    setBusy(true); setError(null);
    try {
      await mutate("/api/billing/payments", "POST", { ...form, amount: Number(form.amount), submissionKey, proofImage: form.proofImage || undefined });
      onClose();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <BillingDialog title={customer ? "Submit payment details" : "Record customer payment"} onClose={onClose} busy={busy || uploading}>
    <form onSubmit={submit} noValidate className="space-y-4">
      <BillingErrorMessage message={error} />
      <div><label className="block text-sm font-medium">Invoice<select required className={invalidField} {...fields.props("invoice", messages.invoice)} value={form.invoiceId} onChange={(event) => setForm({ ...form, invoiceId: event.target.value })}>
        <option value="">Select an unpaid invoice</option>{payable.map((item) => <option key={item.id} value={item.id}>{item.invoiceNumber} — {item.customerName} · {item.label}</option>)}
      </select></label>{fields.error("invoice", messages.invoice)}</div>
      {invoice && <p className="rounded-lg bg-rose-50 p-3 text-sm">Remaining invoice balance: <strong>{formatPeso(invoice.balance)}</strong></p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="text-sm font-medium">Amount paid (PHP)<PesoInput required min="0.01" max={invoice?.balance ?? 1000000000} step="0.01" value={form.amount} wrapperClassName="mt-1.5" {...fields.props("amount", messages.amount)} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>{fields.error("amount", messages.amount)}</div>
        <div><label className="text-sm font-medium">Payment method<select value={form.method} className={invalidField} {...fields.props("method", messages.method)} onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}>
          {paymentMethods.filter((method) => !customer || method !== "Cash").map((method) => <option key={method}>{method}</option>)}
        </select></label>{fields.error("method", messages.method)}{customer && <p className="mt-1.5 text-xs leading-5 text-stone-500">Cash payments are recorded by the Billing Clerk.</p>}</div>
        <div><label className="text-sm font-medium">Payment date<input required type="date" max={manilaDate()} value={form.paidAt} className={invalidField} {...fields.props("paidAt", messages.paidAt)} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} /></label>{fields.error("paidAt", messages.paidAt)}</div>
        <div><label className="text-sm font-medium">Transaction reference {cash ? "(optional)" : ""}<input required={!cash} maxLength={120} value={form.transactionReference} className={invalidField} {...fields.props("transactionReference", messages.transactionReference)} onChange={(event) => setForm({ ...form, transactionReference: event.target.value })} /></label>{fields.error("transactionReference", messages.transactionReference)}</div>
      </div>
      <div><label className="block text-sm font-medium">Payment proof (optional, JPG / PNG / WebP, up to 750 KB)
        <input type="file" accept={embeddedImageAccept} disabled={busy || uploading} className={invalidField} aria-invalid={Boolean(proofError)} aria-describedby={proofError ? "payment-proof-error" : undefined} onChange={async (event) => {
          const file = event.target.files?.[0];
          setError(null); setProofError(null); setForm((previous) => ({ ...previous, proofImage: "" }));
          if (!file) return;
          setUploading(true);
          try { const proofImage = await readEmbeddedImage(file); setForm((previous) => ({ ...previous, proofImage })); }
          catch (error) { setProofError(errorText(error)); event.target.value = ""; }
          finally { setUploading(false); }
        }} />
      </label><FieldError id="payment-proof-error" message={proofError} /></div>
      {form.proofImage && <p className="text-xs text-stone-600">Payment proof attached.</p>}
      <label className="block text-sm font-medium">Notes (optional)<textarea rows={2} maxLength={1000} value={form.notes} className={field} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <p className="text-xs leading-5 text-stone-500">This records a payment made through the selected method. The Billing Clerk will verify the actual transaction before the balance changes and a receipt becomes available.</p>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy || uploading} onClick={onClose}>Cancel</Button><Button disabled={busy || uploading}>{busy ? "Submitting…" : uploading ? "Attaching…" : "Submit for verification"}</Button></div>
    </form>
  </BillingDialog>;
}

/** Starts a simulated PayMongo checkout for an invoice and sends the customer to the test checkout page. */
export function PayOnlineDialog({ invoice, onClose }: { invoice: BillingInvoice; onClose: () => void }) {
  const minimum = Math.min(PAYMONGO_MIN_AMOUNT, invoice.balance);
  const [amount, setAmount] = useState(String(invoice.balance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldMessages();
  const value = Number(amount);
  const amountMessage = amountError(amount, {
    label: "Amount", min: minimum, max: invoice.balance, maxLabel: "the remaining balance",
    minLabel: invoice.balance < PAYMONGO_MIN_AMOUNT ? "the remaining balance, which is below the usual online minimum" : "the minimum online payment",
  });
  const halfBalance = Math.round(invoice.balance * 50) / 100;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fields.blocked({ amount: amountMessage })) return;
    setBusy(true); setError(null);
    try {
      const input: CreateCheckoutInput = { invoiceId: invoice.id, amount: Math.round(value * 100) / 100, returnPath: "/customer/billing" };
      const response = await fetch("/api/payments/paymongo/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const { checkout } = await billingJson<{ checkout: PaymongoCheckoutDto }>(response);
      window.location.assign(checkout.checkoutUrl);
    } catch (error) { setError(errorText(error)); setBusy(false); }
  }
  return <BillingDialog title="Pay online" onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate className="space-y-4">
      <BillingErrorMessage message={error} />
      <div><p className="font-semibold">{invoice.invoiceNumber} · {invoice.label}</p><p className="mt-1 text-sm text-stone-600">Remaining invoice balance: <strong className="text-stone-950">{formatPeso(invoice.balance)}</strong></p></div>
      <div>
        <label className="block text-sm font-medium">Amount to pay (PHP)<PesoInput required min={minimum} max={invoice.balance} step="0.01" wrapperClassName="mt-1.5" {...fields.props("amount", amountMessage)} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        {fields.error("amount", amountMessage)}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAmount(String(invoice.balance))}>Full balance</Button>
          {invoice.balance >= PAYMONGO_MIN_AMOUNT * 2 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAmount(String(halfBalance))}>Half</Button>}
        </div>
      </div>
      <p className="text-xs leading-5 text-stone-500">Minimum online payment is {formatPeso(minimum)}. Partial payments are allowed, but design images only unlock once the fee is fully paid.</p>
      <p className="rounded-lg bg-rose-50 p-3 text-sm leading-6 text-stone-700">This is a test checkout. You will choose a payment method on the next page; no real money is charged.</p>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}><CreditCard className="mr-2 h-4 w-4" />{busy ? "Starting checkout…" : "Continue to checkout"}</Button></div>
    </form>
  </BillingDialog>;
}

export function InvoiceActionDialog({ invoice, action, mutate, onClose }: {
  invoice: BillingInvoice; action: "issue" | "void" | "remind"; mutate: BillingMutation; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldMessages();
  const label = action === "issue" ? "Issue invoice" : action === "void" ? "Void invoice" : "Send payment reminder";
  const reasonMessage = action === "void" ? textError(reason, { label: "Reason for voiding", min: 5, max: 1000 }) : null;
  return <BillingDialog title={label} onClose={onClose} busy={busy}>
    <form className="space-y-4" noValidate onSubmit={async (event) => {
      event.preventDefault();
      if (fields.blocked({ reason: reasonMessage })) return;
      setBusy(true); setError(null);
      try { await mutate(`/api/billing/invoices/${invoice.id}`, "PATCH", { action, ...(action === "void" ? { reason } : {}) }); onClose(); }
      catch (error) { setError(errorText(error)); } finally { setBusy(false); }
    }}>
      <BillingErrorMessage message={error} />
      <p className="font-semibold">{invoice.invoiceNumber} · {invoice.customerName}</p>
      <p className="text-sm text-stone-600">{invoice.label} · {formatPeso(invoice.amount)} · Due {billingDate(invoice.dueDate)}</p>
      <p className="text-sm leading-6 text-stone-600">{action === "issue" ? "The customer will receive this invoice in their Billing page. Check the billing basis, amount, and due date before releasing it. Issued invoices cannot be edited." : action === "void" ? "This record will remain in the history as void. Pending and verified payments must be resolved first." : "Send an in-app reminder to this customer. Only one reminder per invoice is allowed every 24 hours."}</p>
      {action === "void" && <div><label className="block text-sm font-medium">Reason<textarea required maxLength={1000} rows={3} className={invalidField} {...fields.props("reason", reasonMessage)} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{fields.error("reason", reasonMessage)}</div>}
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
  const fields = useFieldMessages();
  const editable = !customer && ["Pending", "Verified"].includes(payment.status) && Boolean(payment.invoiceId);
  const reasonMessage = action === "verify" ? null : textError(reason, { label: action === "reverse" ? "Reason for reversal" : "Reason for rejection", min: 5, max: 1000 });
  const confirmMessage = confirmed ? null : action === "verify" ? "Tick the box to confirm you checked the actual payment before verifying." : action === "reverse" ? "Tick the box to confirm the reversal." : "Tick the box to confirm the rejection.";
  return <BillingDialog title={customer ? "Payment details" : "Review payment"} onClose={onClose} busy={busy}>
    <form className="space-y-4" noValidate onSubmit={async (event) => {
      event.preventDefault();
      if (!editable || fields.blocked({ reason: reasonMessage, confirmed: confirmMessage })) return;
      setBusy(true); setError(null);
      try { await mutate(`/api/billing/payments/${payment.id}`, "PATCH", { action, ...(action !== "verify" ? { reason } : {}) }); onClose(); }
      catch (error) { setError(errorText(error)); } finally { setBusy(false); }
    }}>
      <BillingErrorMessage message={error} />
      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{payment.reference}</p><p className="mt-1 text-sm text-stone-600">{payment.customerName} · {payment.invoiceNumber}</p></div><BillingBadge status={payment.status} /></div>
      <div className="rounded-lg bg-stone-50 p-4"><p className="text-2xl font-semibold tracking-tight">{formatPeso(payment.amount)}</p><p className="mt-2 text-sm text-stone-600">{payment.method} · {billingDate(payment.paidAt)}</p><GatewayPills payment={payment} /><p className="mt-1 break-all text-sm">Reference: {payment.transactionReference || "Cash collection"}</p></div>
      {payment.gateway && payment.status === "Pending" && <p className="rounded-lg bg-rose-50 p-3 text-sm leading-6 text-stone-700">{customer ? "Paid online. The Billing Clerk will review this payment before it is applied to your invoice." : "Paid online, but held for review because it exceeded the remaining balance or the invoice changed. Verify or reject it below."}</p>}
      {payment.notes && <p className="whitespace-pre-wrap text-sm text-stone-600">{payment.notes}</p>}
      {payment.hasProof && <div><p className="mb-2 text-sm font-medium">Submitted proof</p><a href={`/api/billing/payments/${payment.id}/proof`} target="_blank" rel="noreferrer" className="text-sm text-red-700 underline">Open full image</a><Image unoptimized src={`/api/billing/payments/${payment.id}/proof`} alt="Submitted payment proof" width={600} height={400} className="mt-3 max-h-80 w-full rounded-lg border border-stone-200 object-contain" /></div>}
      {payment.reviewNote && <p className="text-sm text-red-800">Review note: {payment.reviewNote}</p>}
      {payment.reversalReason && <p className="text-sm text-red-800">Reversal reason: {payment.reversalReason}</p>}
      {payment.receiptNumber && <Button asChild variant="outline"><a target="_blank" rel="noreferrer" href={`/${customer ? "customer" : "billing-clerk"}/receipts/${payment.id}`}>View receipt {payment.receiptNumber}</a></Button>}
      {editable && <>
        {payment.status === "Pending" && <label className="block text-sm font-medium">Decision<select className={field} value={action} onChange={(event) => { setAction(event.target.value as "verify" | "reject"); setConfirmed(false); }}><option value="verify">Verify payment and issue receipt</option><option value="reject">Reject payment</option></select></label>}
        {action !== "verify" ? <div><label className="block text-sm font-medium">{action === "reverse" ? "Reason for reversal" : "Reason for rejection"}<textarea required maxLength={1000} className={invalidField} {...fields.props("reason", reasonMessage)} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{fields.error("reason", reasonMessage)}</div> : null}
        <div><label className="flex items-start gap-3 rounded-lg border border-stone-200 p-3 text-sm leading-6"><input required type="checkbox" className="mt-1 accent-red-700" {...fields.props("confirmed", confirmMessage)} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{action === "verify" ? "I have confirmed the actual payment, amount, and transaction reference. A screenshot alone is not confirmation." : action === "reverse" ? "Reverse this verified payment, restore the invoice balance, and mark its receipt void. The original receipt and history will be retained." : "I have reviewed this submission and recorded the reason for rejection."}</span></label>{fields.error("confirmed", confirmMessage)}</div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : action === "verify" ? "Verify & issue receipt" : action === "reject" ? "Reject payment" : "Reverse payment"}</Button></div>
      </>}
    </form>
  </BillingDialog>;
}
