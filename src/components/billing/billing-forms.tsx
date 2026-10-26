"use client";

import { useId, useState, type FormEvent } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Clock3, CreditCard, Info, Printer } from "lucide-react";
import { PesoInput } from "@/components/ui/peso-input";
import { FieldError } from "@/components/ui/field-error";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { amountError, dateError, manilaDay, numberError, textError } from "@/lib/form-validation";
import { formatPeso, pesoInputValue } from "@/lib/house-design-data";
import { professionalRoles } from "@/lib/professionals";
import { BillingBadge, BillingDialog, BillingErrorMessage, billingDate, billingFieldClass as field, billingJson } from "@/components/billing/billing-primitives";
import { GatewayPills } from "@/components/billing/billing-tables";
import { embeddedImageAccept, readEmbeddedImage } from "@/lib/client-image-upload";
import { fromCentavos, manilaDate, sumMoney, toCentavos } from "@/lib/billing";
import type { PaymentMilestoneDto } from "@/types/construction";
import { PAYMONGO_MIN_AMOUNT, type CreateCheckoutInput, type PaymongoCheckoutDto } from "@/types/paymongo";
import {
  customerPaymentMethods,
  type BillingApprover, type BillingData, type BillingInvoice, type BillingPayment, type BillingProject, type BillingReceipt, type CustomerPaymentMethod,
} from "@/types/billing";

/** Sends a billing write, refreshes the billing records, and resolves with the response body. */
export type BillingMutation = <T = unknown>(url: string, method: "POST" | "PATCH", body: unknown) => Promise<T>;
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
export function useFieldMessages() {
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
    /** Forgets touched fields and submit attempts, for a form that is reused for another entry. */
    reset() { setSubmitted(false); setTouched({}); },
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
    label: milestone.label, amount: pesoInputValue(milestone.amount), progressPercentage: String(Math.min(100, roundPercent(progress))),
    dueDate: milestone.targetDate && milestone.targetDate >= today ? milestone.targetDate : manilaDate(new Date(Date.now() + 7 * 86_400_000)),
  };
}

export function InvoiceForm({ projects, designRequests, approvers, designRequestId, invoice, mutate, onClose }: {
  projects: BillingProject[]; designRequests: BillingData["designRequests"];
  /** G4's team (Maintenance > About Us); the clerk picks who approved the billing instead of typing it. */
  approvers: BillingApprover[];
  designRequestId?: string; invoice?: BillingInvoice; mutate: BillingMutation; onClose: () => void;
}) {
  const feeTypeOf = (id: string) => designRequests.find((item) => item.id === id)?.feeType ?? invoice?.feeType ?? "design";
  const feeLabelFor = (id: string) => (feeTypeOf(id) === "blueprint" ? "Blueprint fee" : "House design fee");
  const [form, setForm] = useState({
    projectId: invoice?.projectId ?? "", designRequestId: invoice?.designRequestId ?? designRequestId ?? "", milestoneId: invoice?.milestoneId ?? "", label: invoice?.label ?? (designRequestId ? feeLabelFor(designRequestId) : ""), approverId: invoice?.approvedById ?? "",
    progressPercentage: String(invoice?.progressPercentage ?? 0), amount: invoice ? pesoInputValue(invoice.amount) : "", dueDate: invoice?.dueDate ?? manilaDate(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = projects.find((item) => item.id === form.projectId);
  const hasMilestones = !form.designRequestId && Boolean(project?.milestones.length);
  const availableMilestones = hasMilestones ? billableMilestones(project, invoice?.milestoneId) : [];
  const milestone = hasMilestones ? project?.milestones.find((item) => item.id === form.milestoneId) : undefined;
  // The downpayment follows the accepted estimate, so no one is named as its approver.
  const isDownpayment = Boolean(milestone?.isDownpayment);
  /** A saved downpayment keeps its basis, which may name the estimate ("… per accepted estimate EST-…"). */
  const downpaymentText = invoice?.milestoneId === milestone?.id && invoice?.basis ? invoice.basis : downpaymentBasis;
  const approver = approvers.find((item) => item.id === form.approverId);
  /** A draft saved before approvers were picked shows its typed basis until someone is chosen. */
  const typedBasis = invoice && !invoice.approvedById ? invoice.basis : "";
  const fields = useFieldMessages();
  const remaining = project ? Math.round((project.contractPrice - project.allocated + (invoice?.amount ?? 0)) * 100) / 100 : undefined;
  // Milestone amount and progress are fixed by the accepted payment schedule, so only free-entry values are checked.
  const messages = {
    project: !form.designRequestId && !project ? "Choose the customer / project to bill." : null,
    milestone: hasMilestones && !milestone ? "Choose the milestone to bill." : null,
    label: textError(form.label, { label: "Billing stage", min: 3, max: 160 }),
    basis: isDownpayment || approver ? null
      : approvers.length ? "Choose who approved this billing." : "Ask the Admin to add G4's team in Maintenance › About Us first.",
    amount: milestone ? null : amountError(form.amount, { label: "Amount", max: form.designRequestId ? undefined : remaining, maxLabel: "the remaining contract amount" }),
    progress: form.designRequestId || milestone ? null : numberError(form.progressPercentage, { label: "Project progress", min: 0, max: 100, unit: "%", maxDecimals: 2 }),
    dueDate: dateError(form.dueDate, { label: "Due date", min: manilaDay(), minLabel: "today" }),
  };
  function chooseProject(projectId: string) {
    const next = projects.find((item) => item.id === projectId);
    const first = next?.milestones.length ? billableMilestones(next)[0] : undefined;
    setForm({ ...form, projectId, milestoneId: first?.id ?? "", ...(next && first ? milestoneFields(next, first) : {}) });
  }
  function chooseMilestone(milestoneId: string) {
    const picked = project?.milestones.find((item) => item.id === milestoneId);
    if (!project || !picked) { setForm({ ...form, milestoneId }); return; }
    setForm({ ...form, milestoneId, ...milestoneFields(project, picked) });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fields.blocked(messages)) return;
    setBusy(true); setError(null);
    const { projectId, designRequestId, milestoneId, approverId, ...values } = form;
    const input = { ...values, ...(isDownpayment ? { basis: downpaymentText } : { approverId }), ...(designRequestId ? { designRequestId } : { projectId }), ...(hasMilestones ? { milestoneId } : {}), amount: Number(form.amount), progressPercentage: designRequestId ? 0 : Number(form.progressPercentage) };
    try {
      await mutate(invoice ? `/api/billing/invoices/${invoice.id}` : "/api/billing/invoices", invoice ? "PATCH" : "POST", invoice ? { action: "edit", invoice: input } : input);
      onClose();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <BillingDialog title={invoice ? "Edit Draft Billing" : "Prepare Billing"} onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate className="space-y-4">
      <BillingErrorMessage message={error} />
      <label className="block text-sm font-medium">Billing for
        <select disabled={busy || Boolean(invoice)} className={field} value={form.designRequestId ? "design" : "project"} onChange={(event) => { const id = event.target.value === "design" ? (designRequests.find((item) => !item.invoiceId)?.id ?? "") : ""; setForm({ ...form, projectId: "", milestoneId: "", designRequestId: id, label: id ? feeLabelFor(id) : "" }); }}>
          <option value="project">Construction Progress</option><option value="design" disabled={!designRequests.some((item) => !item.invoiceId || item.id === invoice?.designRequestId)}>Blueprint or Design Fee</option>
        </select>
      </label>
      {form.designRequestId ? <label className="block text-sm font-medium">Customer / Design Request
        <SearchableSelect required disabled={busy || Boolean(invoice)} className={field} value={form.designRequestId} onChange={(id) => setForm({ ...form, designRequestId: id, label: feeLabelFor(id) })}
          options={designRequests.filter((item) => !item.invoiceId || item.id === invoice?.designRequestId).map((item) => ({ value: item.id, label: `${item.customerName} — ${item.feeType === "blueprint" ? "Blueprint" : "Design fee"} · ${item.label}` }))}
          placeholder="Search customer or design request" emptyMessage="No design request matches that search." />
        <p className="mt-2 text-xs font-normal leading-5 text-stone-500">{feeTypeOf(form.designRequestId) === "blueprint"
          ? "Set the agreed blueprint fee. Full verified payment unlocks the blueprint download, and only then can the construction downpayment be invoiced."
          : "Use the agreed design fee. Full verified payment unlocks this request only. This fee is separate from the construction contract."}</p>
      </label> : <div><label className="block text-sm font-medium">Customer / Project
        <SearchableSelect required disabled={busy || Boolean(invoice)} className={invalidField} {...fields.props("project", messages.project)} value={form.projectId} onChange={chooseProject}
          options={projects.filter((item) => billableStatuses.includes(item.status) || item.id === invoice?.projectId).map((item) => ({ value: item.id, label: `${item.customerName} — ${item.reference} · ${item.name}` }))}
          placeholder="Search customer or project" emptyMessage="No project matches that search." />
      </label>{fields.error("project", messages.project)}</div>}
      {project && <div className="rounded-lg bg-rose-50 p-3 text-sm text-stone-600">
        Contract: <strong className="text-stone-950">{formatPeso(project.contractPrice)}</strong> · Available to bill, including drafts: <strong className="text-stone-950">{formatPeso(project.contractPrice - project.allocated + (invoice?.amount ?? 0))}</strong>
      </div>}
      {hasMilestones && <div><label className="block text-sm font-medium">Billing Milestone
        <select required disabled={busy || Boolean(invoice)} className={invalidField} {...fields.props("milestone", messages.milestone)} value={form.milestoneId} onChange={(event) => chooseMilestone(event.target.value)}>
          <option value="">{availableMilestones.length ? "Select a milestone to bill" : "No milestone available to bill"}</option>
          {availableMilestones.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.percentage}% · {formatPeso(item.amount)}</option>)}
        </select>
        <p className="mt-2 text-xs font-normal leading-5 text-stone-500">{project?.status === "Awaiting downpayment" ? "Only the downpayment can be billed until it is paid and the project is scheduled." : "Each milestone is billed once, for the exact amount in the accepted payment schedule."}</p>
      </label>{fields.error("milestone", messages.milestone)}</div>}
      <div><label className="block text-sm font-medium">Billing Stage
        <input required maxLength={160} className={invalidField} {...fields.props("label", messages.label)} placeholder="Enter billing stage" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
      </label>{fields.error("label", messages.label)}</div>
      <div><label className="block text-sm font-medium">Billing Basis / Approved Reference
        {isDownpayment ? (
          <p className="mt-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-normal text-stone-700">{downpaymentText}</p>
        ) : (
          <select required disabled={busy} className={invalidField} {...fields.props("basis", messages.basis)} value={approver ? form.approverId : ""} onChange={(event) => setForm({ ...form, approverId: event.target.value })}>
            <option value="">Select who approved this billing</option>
            {professionalRoles.map((role) => {
              const people = approvers.filter((item) => item.role === role);
              return people.length ? (
                <optgroup key={role} label={`${role}s`}>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        )}
        <p className="mt-2 text-xs font-normal leading-5 text-stone-500">
          {isDownpayment ? "The downpayment follows the accepted estimate, so no approver is needed."
            : approver ? `Shows on the invoice as: Approved by ${approver.name} (${approver.role})`
              : typedBasis ? `Previously typed: ${typedBasis}`
                : "Pick from G4's team in Maintenance › About Us. No typing needed."}
        </p>
      </label>{fields.error("basis", messages.basis)}</div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="text-sm font-medium">Amount (PHP)<PesoInput required readOnly={Boolean(milestone)} min="0.01" max="1000000000" step="0.01" wrapperClassName="mt-1.5" {...fields.props("amount", messages.amount)} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>{fields.error("amount", messages.amount)}</div>
        {!form.designRequestId && <div><label className="text-sm font-medium">Project progress (%)<input required readOnly={Boolean(milestone)} type="number" min="0" max="100" step="0.01" className={invalidField} {...fields.props("progress", messages.progress)} value={form.progressPercentage} onChange={(event) => setForm({ ...form, progressPercentage: event.target.value })} /></label>{fields.error("progress", messages.progress)}</div>}
        <div><label className="text-sm font-medium">Due Date<input required type="date" className={invalidField} {...fields.props("dueDate", messages.dueDate)} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>{fields.error("dueDate", messages.dueDate)}</div>
      </div>
      <p className="text-xs leading-5 text-stone-500">Review the saved draft before issuing it to the customer.</p>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save Draft"}</Button></div>
    </form>
  </BillingDialog>;
}

/** Payments on an invoice that were submitted or recorded but not yet verified by the Billing Clerk. */
export type PendingTotals = { count: number; total: number };

export function pendingTotals(payments: BillingPayment[], invoiceId: string): PendingTotals {
  const pending = payments.filter((payment) => payment.invoiceId === invoiceId && payment.status === "Pending");
  return { count: pending.length, total: sumMoney(pending.map((payment) => payment.amount)) };
}

/** What would remain on the invoice once every pending payment is verified. */
export const balanceAfterPending = (invoice: BillingInvoice, pending: PendingTotals) =>
  fromCentavos(Math.max(0, toCentavos(invoice.balance) - toCentavos(pending.total)));

export const countLabel = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Optional proof image for a payment; reports the encoded image ("" when cleared) and whether it is still being read. */
function PaymentProofField({ label, attached, disabled, onChange, onUploading }: {
  label: string; attached: boolean; disabled: boolean; onChange: (proofImage: string) => void; onUploading: (uploading: boolean) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return <div>
    <label className="block text-sm font-medium" htmlFor={id}>{label} <span className="font-normal text-stone-500">(optional, JPG / PNG / WebP, up to 750 KB)</span></label>
    <input id={id} type="file" accept={embeddedImageAccept} disabled={disabled} className={invalidField} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={async (event) => {
      const file = event.target.files?.[0];
      setError(null); onChange("");
      if (!file) return;
      onUploading(true);
      try { onChange(await readEmbeddedImage(file)); }
      catch (reason) { setError(errorText(reason)); event.target.value = ""; }
      finally { onUploading(false); }
    }} />
    <FieldError id={`${id}-error`} message={error} />
    {attached && <p className="mt-1.5 text-xs text-stone-600">Payment proof attached.</p>}
  </div>;
}

const customerMethodText: Record<CustomerPaymentMethod, {
  title: string; detail: string; date: string; reference: string; placeholder: string; help: string; proof: string; footnote: string;
}> = {
  "Bank transfer": {
    title: "Bank transfer or deposit", detail: "InstaPay, PESONet or over the counter",
    date: "Transfer or deposit date", reference: "Bank reference no.", placeholder: "Enter bank reference no.",
    help: "From your transfer confirmation or deposit slip.", proof: "Deposit slip or transfer screenshot",
    footnote: "The Billing Clerk matches your reference number with G4 Builders Inc bank records before the balance changes and a receipt becomes available.",
  },
  Cheque: {
    title: "Cheque", detail: "Payable to G4 Builders Inc",
    date: "Cheque date", reference: "Cheque no.", placeholder: "Enter cheque no.",
    help: "Include the issuing bank so the Billing Clerk can match the cheque.", proof: "Photo of the cheque",
    footnote: "Make the cheque payable to G4 Builders Inc. The balance changes and a receipt becomes available once the Billing Clerk confirms the cheque has cleared.",
  },
};

type AmountMode = "full" | "partial";

/** "Full balance" pays the whole remaining balance; "Partial payment" lets the customer enter part of it. */
function AmountChoice({ name, mode, balance, disabled, onChange }: {
  name: string; mode: AmountMode; balance: number; disabled: boolean; onChange: (mode: AmountMode) => void;
}) {
  const options: { value: AmountMode; title: string; detail: string }[] = [
    { value: "full", title: "Full balance", detail: `Pay the whole ${formatPeso(balance)} now.` },
    { value: "partial", title: "Partial payment", detail: "Pay part of it now and the rest later." },
  ];
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="text-sm font-medium">How much are you paying?</legend>
    <div className="mt-2 grid gap-3 sm:grid-cols-2">{options.map((option) => <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3.5 transition has-[:checked]:border-red-700 has-[:checked]:bg-rose-50 has-[:checked]:ring-1 has-[:checked]:ring-red-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red-600">
      <input type="radio" name={name} value={option.value} checked={mode === option.value} onChange={() => onChange(option.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-red-700" />
      <span className="min-w-0"><span className="block text-sm font-semibold text-stone-950">{option.title}</span><span className="mt-1 block text-xs leading-5 text-stone-600">{option.detail}</span></span>
    </label>)}</div>
  </fieldset>;
}

/** The amount shown, not typed, when the customer pays the full balance. */
function FullAmount({ label, balance }: { label: string; balance: number }) {
  return <div><p className="text-sm font-medium">{label}</p><p className="mt-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm font-semibold tabular-nums text-stone-950">{formatPeso(balance)}</p></div>;
}

/** A customer's bank deposit or cheque details for one invoice; the Billing Clerk verifies them before the balance changes. */
export function CustomerPaymentForm({ invoice, pending, mutate, onClose, onPayOnline }: {
  invoice: BillingInvoice; pending: PendingTotals; mutate: BillingMutation; onClose: () => void; onPayOnline: () => void;
}) {
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState<CustomerPaymentMethod>("Bank transfer");
  const [form, setForm] = useState({ amount: "", transactionReference: "", paidAt: manilaDate(), notes: "", proofImage: "" });
  const [amountMode, setAmountMode] = useState<AmountMode>("full");
  const amount = amountMode === "full" ? String(invoice.balance) : form.amount;
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldMessages();
  const text = customerMethodText[method];
  const messages = {
    amount: amountError(amount, { label: "Amount", max: invoice.balance, maxLabel: "the remaining invoice balance" }),
    paidAt: dateError(form.paidAt, { label: text.date, max: manilaDay(), maxLabel: "today" }),
    transactionReference: textError(form.transactionReference, { label: text.reference, min: 3, max: 120 }),
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fields.blocked(messages)) return;
    setBusy(true); setError(null);
    try {
      await mutate("/api/billing/payments", "POST", {
        ...form, invoiceId: invoice.id, method, amount: Number(amount), submissionKey, proofImage: form.proofImage || undefined,
      });
      onClose();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <BillingDialog title="Submit Bank Deposit or Cheque" onClose={onClose} busy={busy || uploading}>
    <form onSubmit={submit} noValidate className="space-y-5">
      <BillingErrorMessage message={error} />
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
        <p className="text-xs text-stone-500">Paying invoice</p>
        <p className="mt-1 break-words font-semibold">{invoice.invoiceNumber} · {invoice.label}</p>
        <p className="mt-1 text-sm text-stone-600">Remaining balance <strong className="text-stone-950">{formatPeso(invoice.balance)}</strong>{pending.count > 0 && ` · ${formatPeso(pending.total)} awaiting verification`}</p>
      </div>
      <p className="flex items-start gap-2 text-sm leading-6 text-stone-600">
        <Info className="mt-1 h-4 w-4 shrink-0 text-stone-500" aria-hidden="true" />
        <span>Paying with GCash, Maya, GrabPay, card or online banking? <button type="button" disabled={busy || uploading} className="font-semibold text-red-700 underline underline-offset-4 hover:text-red-800" onClick={onPayOnline}>Use Pay online</button> instead. It is confirmed instantly.</span>
      </p>
      <fieldset disabled={busy} className="min-w-0">
        <legend className="text-sm font-medium">How did you pay?</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">{customerPaymentMethods.map((item) => <label key={item} className="flex min-h-[76px] cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3.5 transition has-[:checked]:border-red-700 has-[:checked]:bg-rose-50 has-[:checked]:ring-1 has-[:checked]:ring-red-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red-600">
          <input type="radio" name="customer-payment-method" value={item} checked={method === item} onChange={() => setMethod(item)} className="mt-0.5 h-4 w-4 shrink-0 accent-red-700" />
          <span className="min-w-0"><span className="block text-sm font-semibold text-stone-950">{customerMethodText[item].title}</span><span className="mt-1 block text-xs leading-5 text-stone-600">{customerMethodText[item].detail}</span></span>
        </label>)}</div>
        <p className="mt-2 text-xs text-stone-500">Paying in cash? Pay at the G4 Builders Inc office and the Billing Clerk will record it.</p>
      </fieldset>
      <AmountChoice name="customer-payment-amount" mode={amountMode} balance={invoice.balance} disabled={busy} onChange={setAmountMode} />
      <div className="grid gap-4 sm:grid-cols-2">
        {amountMode === "full"
          ? <FullAmount label="Amount paid (PHP)" balance={invoice.balance} />
          : <div><label className="text-sm font-medium">Amount paid (PHP)<PesoInput required min="0.01" max={invoice.balance} step="0.01" value={form.amount} wrapperClassName="mt-1.5" {...fields.props("amount", messages.amount)} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>{fields.error("amount", messages.amount)}</div>}
        <div><label className="text-sm font-medium">{text.date}<input required type="date" max={manilaDate()} value={form.paidAt} className={invalidField} {...fields.props("paidAt", messages.paidAt)} onChange={(event) => setForm({ ...form, paidAt: event.target.value })} /></label>{fields.error("paidAt", messages.paidAt)}</div>
        <div className="sm:col-span-2"><label className="text-sm font-medium">{text.reference}<input required maxLength={120} placeholder={text.placeholder} value={form.transactionReference} className={invalidField} {...fields.props("transactionReference", messages.transactionReference)} onChange={(event) => setForm({ ...form, transactionReference: event.target.value })} /></label>{fields.error("transactionReference", messages.transactionReference)}<p className="mt-1.5 text-xs text-stone-500">{text.help}</p></div>
      </div>
      <PaymentProofField label={text.proof} attached={Boolean(form.proofImage)} disabled={busy || uploading} onUploading={setUploading} onChange={(proofImage) => { setError(null); setForm((previous) => ({ ...previous, proofImage })); }} />
      <label className="block text-sm font-medium">Notes (optional)<textarea rows={2} maxLength={1000} value={form.notes} className={field} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <p className="text-xs leading-5 text-stone-500">{text.footnote}</p>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy || uploading} onClick={onClose}>Cancel</Button><Button disabled={busy || uploading}>{busy ? "Submitting…" : uploading ? "Attaching…" : "Submit for Verification"}</Button></div>
    </form>
  </BillingDialog>;
}

async function loadReceipt(paymentId: string) {
  try { return await billingJson<BillingReceipt>(await fetch(`/api/billing/payments/${paymentId}/receipt`, { cache: "no-store" })); }
  catch { return null; }
}

type RecordedPayment = { id: string; amount: number; invoiceNumber: string; receipt: BillingReceipt | null };

/** Shown after the clerk saves a cash payment, with its receipt ready to print. */
function RecordedPaymentSummary({ recorded, onAgain }: { recorded: RecordedPayment; onAgain: () => void }) {
  const receipt = recorded.receipt?.receipt;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3.5">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-900 text-white"><Check className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-xl font-semibold tracking-tight">{formatPeso(recorded.amount)} received in cash</p>
        <p className="mt-1 text-sm text-stone-600">{recorded.invoiceNumber}{receipt ? ` · ${billingDate(receipt.paidAt)}` : ""}</p>
      </div>
      <BillingBadge status="Verified" />
    </div>
    {receipt ? <div className="overflow-hidden rounded-xl border border-stone-200">
      <p className="break-words bg-red-700 px-4 py-3 font-semibold text-white">Receipt for #{receipt.number}</p>
      <dl className="grid gap-x-5 gap-y-4 p-4 text-sm sm:grid-cols-2">{[
        ["Customer", receipt.customerName], ["Invoice", `${receipt.invoiceNumber} · ${receipt.invoiceLabel}`],
        ["Amount paid", formatPeso(receipt.amount)], ["Balance after payment", formatPeso(receipt.balanceAfterPayment)],
        ["Method", receipt.method], ["Reference", receipt.transactionReference],
        ["Verified by", receipt.verifiedByName], ["Issued", billingDate(receipt.issuedAt)],
      ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-stone-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}</dl>
    </div> : <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">The payment is verified and its receipt is ready to print.</p>}
    <p className="text-sm leading-6 text-stone-600">{receipt?.customerName ?? "The customer"} was notified and can open this receipt from Billing Status. The amount is added to your cash total for the day. If this was entered by mistake, open the payment and void it.</p>
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" onClick={onAgain}>Record Another</Button>
      <Button asChild><a target="_blank" rel="noreferrer" href={`/billing-clerk/receipts/${recorded.id}`}><Printer className="mr-2 h-4 w-4" />Print Receipt</a></Button>
    </div>
  </div>;
}

/**
 * The Billing Clerk's record of cash paid at the office. Cash is the clerk's only method: customers submit bank
 * transfers and cheques themselves and pay by card or e-wallet online. Cash is verified, receipted and dated by the
 * server as it is saved, then counted in the clerk's daily cash report.
 */
export function RecordPaymentForm({ invoices, selectedInvoice, mutate, onClose }: {
  invoices: BillingInvoice[]; selectedInvoice?: BillingInvoice; mutate: BillingMutation; onClose: () => void;
}) {
  const blankForm = (invoiceId = selectedInvoice?.id ?? "") => ({ submissionKey: crypto.randomUUID(), invoiceId, amount: "", notes: "", cashReceived: false });
  const [form, setForm] = useState(() => blankForm());
  const [recorded, setRecorded] = useState<RecordedPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldMessages();
  const payable = invoices.filter((invoice) => !["Draft", "Void"].includes(invoice.status) && invoice.balance > 0);
  const invoice = payable.find((item) => item.id === form.invoiceId);
  const messages = {
    invoice: invoice ? null : "Choose the invoice being paid.",
    amount: amountError(form.amount, { label: "Amount", max: invoice?.balance, maxLabel: "the remaining invoice balance" }),
    cashReceived: form.cashReceived ? null : "Tick the box to confirm you received and counted the cash.",
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fields.blocked(messages) || !invoice) return;
    setBusy(true); setError(null);
    try {
      const { id } = await mutate<{ id: string }>("/api/billing/payments", "POST", {
        invoiceId: form.invoiceId, amount: Number(form.amount), method: "Cash", transactionReference: "",
        notes: form.notes, submissionKey: form.submissionKey, cashReceived: true,
      });
      setRecorded({ id, amount: Number(form.amount), invoiceNumber: invoice.invoiceNumber, receipt: await loadReceipt(id) });
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  function recordAnother() {
    setForm(blankForm(payable.some((item) => item.id === form.invoiceId) ? form.invoiceId : ""));
    setRecorded(null); setError(null); fields.reset();
  }
  return <BillingDialog title={recorded ? "Cash Payment Recorded" : "Record Cash Payment"} onClose={onClose} busy={busy}>
    {recorded ? <RecordedPaymentSummary recorded={recorded} onAgain={recordAnother} /> : <form onSubmit={submit} noValidate className="space-y-4">
      <BillingErrorMessage message={error} />
      <div><label className="block text-sm font-medium">Invoice<SearchableSelect required className={invalidField} {...fields.props("invoice", messages.invoice)} value={form.invoiceId} onChange={(invoiceId) => setForm({ ...form, invoiceId, cashReceived: false })}
        options={payable.map((item) => ({ value: item.id, label: `${item.invoiceNumber} — ${item.customerName} · ${item.label}` }))}
        placeholder="Search invoice number or customer" emptyMessage="No unpaid invoice matches that search." /></label>{fields.error("invoice", messages.invoice)}</div>
      {invoice && <p className="rounded-lg bg-rose-50 p-3 text-sm">Remaining invoice balance: <strong>{formatPeso(invoice.balance)}</strong></p>}
      <div><label className="text-sm font-medium">Amount received (PHP)<PesoInput required min="0.01" max={invoice?.balance ?? 1000000000} step="0.01" value={form.amount} wrapperClassName="mt-1.5" {...fields.props("amount", messages.amount)} onChange={(event) => setForm({ ...form, amount: event.target.value, cashReceived: false })} /></label>{fields.error("amount", messages.amount)}</div>
      <label className="block text-sm font-medium">Notes (optional)<textarea rows={2} maxLength={1000} value={form.notes} className={field} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <div><label className="flex items-start gap-3 rounded-lg border border-stone-200 p-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-red-700" {...fields.props("cashReceived", messages.cashReceived)} checked={form.cashReceived} onChange={(event) => setForm({ ...form, cashReceived: event.target.checked })} /><span>I received {messages.amount ? "this amount" : formatPeso(Number(form.amount))} in cash from the customer and counted it.</span></label>{fields.error("cashReceived", messages.cashReceived)}</div>
      <p className="flex items-start gap-2.5 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700"><Check className="mt-1 h-4 w-4 shrink-0 text-stone-900" aria-hidden="true" /><span>Cash is saved as <strong>Verified</strong> with today&apos;s date and time. The balance updates, the receipt is issued, and the amount is added to your cash total for the day.</span></p>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Record & Issue Receipt"}</Button></div>
    </form>}
  </BillingDialog>;
}

/** Starts a simulated PayMongo checkout for an invoice and sends the customer to the test checkout page. */
export function PayOnlineDialog({ invoice, pending, onClose }: { invoice: BillingInvoice; pending: PendingTotals; onClose: () => void }) {
  const minimum = Math.min(PAYMONGO_MIN_AMOUNT, invoice.balance);
  const hasPending = pending.count > 0;
  const afterPending = balanceAfterPending(invoice, pending);
  // With payments still awaiting verification, start at what is left after them, so the same balance is not paid twice.
  const [amountMode, setAmountMode] = useState<AmountMode>(hasPending && afterPending > 0 && afterPending < invoice.balance ? "partial" : "full");
  const [partialAmount, setPartialAmount] = useState(() => hasPending && afterPending > 0 ? pesoInputValue(afterPending) : "");
  const amount = amountMode === "full" ? String(invoice.balance) : partialAmount;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = useFieldMessages();
  const value = Number(amount);
  const amountMessage = amountError(amount, {
    label: "Amount", min: minimum, max: invoice.balance, maxLabel: "the remaining balance",
    minLabel: invoice.balance < PAYMONGO_MIN_AMOUNT ? "the remaining balance, which is below the usual online minimum" : "the minimum online payment",
  });
  const overPending = hasPending && afterPending > 0 && !amountMessage && value > afterPending;
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
  return <BillingDialog title="Pay Online" onClose={onClose} busy={busy}>
    <form onSubmit={submit} noValidate className="space-y-4">
      <BillingErrorMessage message={error} />
      <div><p className="font-semibold">{invoice.invoiceNumber} · {invoice.label}</p><p className="mt-1 text-sm text-stone-600">Remaining invoice balance: <strong className="text-stone-950">{formatPeso(invoice.balance)}</strong></p></div>
      {hasPending && (afterPending > 0
        ? <p className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-stone-700"><Clock3 className="mt-1 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" /><span>You already submitted <strong className="text-stone-950">{formatPeso(pending.total)}</strong> for this invoice ({countLabel(pending.count, "payment")} awaiting verification). To avoid paying twice, the amount starts at what remains after them.</span></p>
        : <p className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900"><AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" /><span>Your submitted payments (<strong>{formatPeso(pending.total)}</strong>) already cover this balance. Wait for the Billing Clerk to verify them. Pay online only if one of those submissions was a mistake.</span></p>)}
      <AmountChoice name="online-payment-amount" mode={amountMode} balance={invoice.balance} disabled={busy} onChange={setAmountMode} />
      {amountMode === "full" ? <FullAmount label="Amount to pay (PHP)" balance={invoice.balance} /> : <div>
        <label className="block text-sm font-medium">Amount to pay (PHP)<PesoInput required min={minimum} max={invoice.balance} step="0.01" wrapperClassName="mt-1.5" {...fields.props("amount", amountMessage)} value={partialAmount} onChange={(event) => setPartialAmount(event.target.value)} /></label>
        {fields.error("amount", amountMessage)}
        {hasPending && afterPending > 0 && <div className="mt-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setPartialAmount(pesoInputValue(afterPending))}>After Pending · {formatPeso(afterPending)}</Button></div>}
      </div>}
      {overPending && <p className="text-xs text-red-700">This is more than what remains after your pending payments ({formatPeso(afterPending)}).</p>}
      <p className="text-xs leading-5 text-stone-500">Minimum online payment is {formatPeso(minimum)}. Partial payments are allowed, but design images only unlock once the fee is fully paid.</p>
      <p className="rounded-lg bg-rose-50 p-3 text-sm leading-6 text-stone-700">This is a test checkout. You will choose GCash, Maya, GrabPay, card, online banking or QR Ph on the next page; no real money is charged.</p>
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}><CreditCard className="mr-2 h-4 w-4" />{busy ? "Starting checkout…" : "Continue to Checkout"}</Button></div>
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
  const label = action === "issue" ? "Issue Invoice" : action === "void" ? "Void Invoice" : "Send Payment Reminder";
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
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : label}</Button></div>
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
  const reasonMessage = action === "verify" ? null : textError(reason, { label: action === "reverse" ? "Reason for voiding" : "Reason for rejection", min: 5, max: 1000 });
  const confirmMessage = confirmed ? null : action === "verify" ? "Tick the box to confirm you checked the actual payment before verifying." : action === "reverse" ? "Tick the box to confirm voiding this payment." : "Tick the box to confirm the rejection.";
  return <BillingDialog title={customer ? "Payment Details" : "Review Payment"} onClose={onClose} busy={busy}>
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
      {payment.hasProof && <div><p className="mb-2 text-sm font-medium">Submitted Proof</p><a href={`/api/billing/payments/${payment.id}/proof`} target="_blank" rel="noreferrer" className="text-sm text-red-700 underline">Open Full Image</a><Image unoptimized src={`/api/billing/payments/${payment.id}/proof`} alt="Submitted payment proof" width={600} height={400} className="mt-3 max-h-80 w-full rounded-lg border border-stone-200 object-contain" /></div>}
      {payment.reviewNote && <p className="text-sm text-red-800">Review note: {payment.reviewNote}</p>}
      {payment.reversalReason && <p className="text-sm text-red-800">Void reason: {payment.reversalReason}</p>}
      {payment.receiptNumber && <Button asChild variant="outline"><a target="_blank" rel="noreferrer" href={`/${customer ? "customer" : "billing-clerk"}/receipts/${payment.id}`}>View receipt {payment.receiptNumber}</a></Button>}
      {editable && <>
        {payment.status === "Pending" && <label className="block text-sm font-medium">Decision<select className={field} value={action} onChange={(event) => { setAction(event.target.value as "verify" | "reject"); setConfirmed(false); }}><option value="verify">Verify payment and issue receipt</option><option value="reject">Reject payment</option></select></label>}
        {action !== "verify" ? <div><label className="block text-sm font-medium">{action === "reverse" ? "Reason for Voiding" : "Reason for Rejection"}<textarea required maxLength={1000} className={invalidField} {...fields.props("reason", reasonMessage)} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{fields.error("reason", reasonMessage)}</div> : null}
        <div><label className="flex items-start gap-3 rounded-lg border border-stone-200 p-3 text-sm leading-6"><input required type="checkbox" className="mt-1 accent-red-700" {...fields.props("confirmed", confirmMessage)} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{action === "verify" ? "I have confirmed the actual payment, amount, and transaction reference. A screenshot alone is not confirmation." : action === "reverse" ? "Void this verified payment, restore the invoice balance, and mark its receipt void. The original receipt and history will be retained." : "I have reviewed this submission and recorded the reason for rejection."}</span></label>{fields.error("confirmed", confirmMessage)}</div>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : action === "verify" ? "Verify & Issue Receipt" : action === "reject" ? "Reject Payment" : "Void Payment"}</Button></div>
      </>}
    </form>
  </BillingDialog>;
}
