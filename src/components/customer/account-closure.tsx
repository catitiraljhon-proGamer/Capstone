"use client";

import { FormDialog } from "@/components/ui/form-dialog";
import { closureReasons, deleteConfirmWord, type AccountClosureDto } from "@/lib/account-closure";
import {
  Archive, ArrowUpRight, Check, CirclePause, Download, LoaderCircle, MessageCircleQuestion, ShieldCheck, Trash2, X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type Choice = "deactivate" | "delete";

const panel = "min-w-0 rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-950 transition hover:bg-stone-50 disabled:opacity-50";
const fieldClass = "mt-2 min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-950 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20 disabled:opacity-50";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Something went wrong. Try again.");
  return payload;
}

function BeforeYouGo({ closure }: { closure: AccountClosureDto }) {
  const open = closure.checks.filter((check) => !check.ok).length;
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight">Before you go</h2>
          <p className="mt-1 text-sm text-stone-600">You can deactivate or delete your account once nothing is open with G4 Builders.</p>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${open ? "bg-red-700 text-white" : "bg-stone-100 text-stone-700"}`}>
          {open ? `${open} ${open === 1 ? "item" : "items"} still open` : "Nothing open"}
        </span>
      </div>
      <ul className="mt-4 divide-y divide-stone-200 border-t border-stone-200">
        {closure.checks.map((check) => (
          <li key={check.key} className="flex items-start gap-3 py-3">
            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${check.ok ? "bg-stone-100 text-stone-700" : "bg-red-700 text-white"}`}>
              {check.ok ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <X aria-hidden="true" className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{check.title}<span className="sr-only">{check.ok ? ": done" : ": still open"}</span></p>
              <p className="text-sm break-words text-stone-600">{check.detail}</p>
            </div>
            {check.ok ? null : (
              <Link href={check.href} className="shrink-0 text-sm font-semibold text-red-700 hover:text-red-800 hover:underline">{check.linkLabel}</Link>
            )}
          </li>
        ))}
      </ul>
      {closure.canClose ? (
        closure.warrantyUntil ? (
          <div className="mt-2 flex gap-3 rounded-lg bg-rose-50 p-4 text-sm leading-6 text-stone-700">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            <p>Your warranty runs until <strong className="text-stone-950">{closure.warrantyUntil}</strong>. Once your account is deleted, you can no longer report a problem online. Contact G4 Builders directly instead.</p>
          </div>
        ) : null
      ) : (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
          Finish your project, payments, and requests first. If you need help, message G4 Builders.
        </p>
      )}
    </section>
  );
}

function ChoiceCard({ value, icon: Icon, title, tag, body, checked, disabled, onChange }: {
  value: Choice; icon: LucideIcon; title: string; tag: string; body: string; checked: boolean; disabled: boolean; onChange: (value: Choice) => void;
}) {
  return (
    <label className={`flex h-full flex-col rounded-xl border p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red-600 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${checked ? "border-red-700 bg-rose-50/60 ring-1 ring-red-700" : "border-stone-200 hover:border-stone-400"}`}>
      <input type="radio" name="account-closure" value={value} checked={checked} disabled={disabled} onChange={() => onChange(value)} className="sr-only" />
      <span className="flex w-full items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${checked ? "bg-red-700 text-white" : "bg-stone-100 text-stone-600"}`}><Icon aria-hidden="true" className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1 font-semibold">{title}</span>
        <span aria-hidden="true" className={`ml-auto grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${checked ? "border-red-700" : "border-stone-300"}`}>
          {checked ? <span className="h-2.5 w-2.5 rounded-full bg-red-700" /> : null}
        </span>
      </span>
      <span className="mt-3 flex-1 text-sm leading-6 text-stone-600">{body}</span>
      <span className={`mt-3 inline-flex w-fit rounded px-2 py-0.5 text-xs font-semibold ${value === "deactivate" ? "bg-stone-100 text-stone-700" : "bg-red-50 text-red-800"}`}>{tag}</span>
    </label>
  );
}

function TimelineStep({ when, title, body, last = false }: { when: string; title: string; body: string; last?: boolean }) {
  return (
    <li className={`relative flex gap-4 ${last ? "" : "pb-5"}`}>
      {last ? null : <span aria-hidden="true" className="absolute top-5 left-[7px] h-full w-px bg-stone-200" />}
      <span aria-hidden="true" className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-red-700 ${last ? "bg-red-700" : "bg-white"}`} />
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{when}</p>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-stone-600">{body}</p>
      </div>
    </li>
  );
}

function ConfirmDialog({ choice, closure, reason, onClose }: { choice: Choice; closure: AccountClosureDto; reason: string; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleting = choice === "delete";
  const ready = !deleting || typed.trim().toUpperCase() === deleteConfirmWord;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await readJson<{ action: Choice; deletesOn?: string }>(await fetch("/api/account/closure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: choice, ...(reason ? { reason } : {}), ...(deleting ? { confirm: typed } : {}) }),
      }));
      // The response signed the customer out; a full load leaves no signed-in pages behind.
      window.location.assign(result.action === "delete" ? "/login?deleted=1" : `/login?deactivated=${result.deletesOn ?? ""}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <FormDialog title={deleting ? "Delete your account permanently?" : "Deactivate your account?"} error={error} busy={busy} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm leading-6 text-stone-600">
          {deleting
            ? "Your sign-in and personal details are removed now. This can't be undone. G4 Builders keeps your project, invoice, and payment records."
            : <>You&apos;ll be signed out now. Sign in before <strong className="text-stone-950">{closure.deletesOn}</strong> to reactivate it. After that, your account is deleted automatically.</>}
        </p>
        {deleting ? (
          <label className="block text-sm font-medium text-stone-700">
            Type <strong className="text-stone-950">{deleteConfirmWord}</strong> to confirm
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" autoFocus disabled={busy} className={fieldClass} />
          </label>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={!ready || busy} className={primaryButton}>
            {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            {deleting ? (busy ? "Deleting…" : "Delete Account") : (busy ? "Deactivating…" : "Deactivate")}
          </button>
        </div>
      </form>
    </FormDialog>
  );
}

/** Manage Account › Deactivate or Delete. */
export function AccountClosure() {
  const [closure, setClosure] = useState<AccountClosureDto | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<Choice>("deactivate");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/closure", { cache: "no-store", signal: controller.signal })
      .then((response) => readJson<{ closure: AccountClosureDto }>(response))
      .then((payload) => setClosure(payload.closure))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setLoadError(failure instanceof Error ? failure.message : "Your account details could not be loaded.");
      });
    return () => controller.abort();
  }, [attempt]);

  if (loadError) {
    return (
      <div role="alert" className="space-y-3 text-sm text-red-700">
        <p>{loadError}</p>
        <button type="button" onClick={() => { setLoadError(""); setAttempt((value) => value + 1); }} className="min-h-11 font-semibold underline">Try Again</button>
      </div>
    );
  }
  if (!closure) return <p role="status" className="text-sm text-stone-500">Checking your account…</p>;

  const blocked = !closure.canClose;
  const deleting = choice === "delete";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-5">
        <BeforeYouGo closure={closure} />

        <section className={panel}>
          <h2 className="font-semibold tracking-tight">Choose what to do</h2>
          <div role="radiogroup" aria-label="Deactivate or delete your account" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <ChoiceCard
              value="deactivate" icon={CirclePause} title="Deactivate account" tag={`Can be undone for ${closure.deleteDays} days`}
              body={`Take a break. You're signed out and stop getting updates. Sign back in within ${closure.deleteDays} days to turn your account back on.`}
              checked={choice === "deactivate"} disabled={blocked} onChange={setChoice}
            />
            <ChoiceCard
              value="delete" icon={Trash2} title="Delete account" tag="Can't be undone"
              body="Remove your account now. You can't sign in again and would need to register a new account for a future project."
              checked={deleting} disabled={blocked} onChange={setChoice}
            />
          </div>

          {blocked ? null : deleting ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-lg border border-stone-200 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><Trash2 aria-hidden="true" className="h-4 w-4 text-red-700" />Removed right away</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-600">
                  <li>Your sign-in (password or Google)</li>
                  <li>Contact number, address, and occupation</li>
                  <li>Your notifications</li>
                </ul>
              </div>
              <div className="rounded-lg border border-stone-200 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><Archive aria-hidden="true" className="h-4 w-4 text-stone-500" />Kept by G4 Builders</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-600">
                  <li>Your project records</li>
                  <li>Invoices, official receipts, and payments</li>
                  <li>Needed for the company&apos;s books</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-stone-200 p-4">
              <p className="text-sm font-semibold">What happens next</p>
              <ol className="mt-4">
                <TimelineStep when="Today" title="Deactivated" body="You're signed out, and we email you a confirmation." />
                <TimelineStep when={closure.remindsOn} title="Reminder email" body={`${closure.reminderDays} ${closure.reminderDays === 1 ? "day" : "days"} left to sign back in.`} />
                <TimelineStep when={closure.deletesOn} title="Deleted automatically" body="Only if you haven't signed back in by then." last />
              </ol>
              <p className="mt-4 border-t border-stone-200 pt-3 text-sm leading-6 text-stone-600">
                Changed your mind? Sign in before <strong className="text-stone-950">{closure.deletesOn}</strong> and choose <strong className="text-stone-950">Reactivate</strong>. Your project, billing, and files will be where you left them.
              </p>
            </div>
          )}

          <label className="mt-5 block text-sm font-medium text-stone-700">
            Why are you leaving? <span className="font-normal text-stone-500">(optional)</span>
            <select value={reason} onChange={(event) => setReason(event.target.value)} disabled={blocked} className={fieldClass}>
              <option value="">Choose a reason</option>
              {closureReasons.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <span className="mt-1 block text-xs font-normal text-stone-500">Only G4 Builders sees this.</span>
          </label>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-stone-500">{blocked ? "Close the open items above to continue." : "You'll be asked to confirm."}</p>
            <button type="button" disabled={blocked} onClick={() => setConfirming(true)} className={primaryButton}>
              {deleting ? <Trash2 aria-hidden="true" className="h-4 w-4" /> : <CirclePause aria-hidden="true" className="h-4 w-4" />}
              {deleting ? "Delete Account" : "Deactivate Account"}
            </button>
          </div>
        </section>
      </div>

      <div className="space-y-5">
        <section className={panel}>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-red-700"><Download aria-hidden="true" className="h-5 w-5" /></span>
            <h2 className="font-semibold tracking-tight">Save your files first</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-600">Download your blueprint and official receipts now. You can&apos;t open them after your account is deleted.</p>
          <div className="mt-4 grid gap-2">
            <Link href="/customer/dream-house" className={`${secondaryButton} justify-between`}>Blueprint in Dream House<ArrowUpRight aria-hidden="true" className="h-4 w-4 text-stone-400" /></Link>
            <Link href="/customer/billing" className={`${secondaryButton} justify-between`}>Receipts in Billing Status<ArrowUpRight aria-hidden="true" className="h-4 w-4 text-stone-400" /></Link>
          </div>
        </section>
        <section className={panel}>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-600"><MessageCircleQuestion aria-hidden="true" className="h-5 w-5" /></span>
            <h2 className="font-semibold tracking-tight">Something wrong?</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-stone-600">If you&apos;re leaving because of your project or billing, talk to us first. We may be able to fix it.</p>
          <Link href="/customer/messages" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-red-700 hover:text-red-800 hover:underline">Message G4 Builders</Link>
        </section>
      </div>

      {confirming ? <ConfirmDialog choice={choice} closure={closure} reason={reason} onClose={() => setConfirming(false)} /> : null}
    </div>
  );
}
