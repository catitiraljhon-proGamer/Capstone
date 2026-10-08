"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard, FlaskConical, Landmark, QrCode, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPeso } from "@/lib/house-design-data";
import { BillingErrorMessage, billingFieldClass as field, billingJson } from "@/components/billing/billing-primitives";
import { paymongoMethodLabels, paymongoMethods, type CheckoutStatus, type PaymongoCheckoutDto, type PaymongoMethod, type SimulatorAction } from "@/types/paymongo";

const methodIcons: Record<PaymongoMethod, LucideIcon> = { gcash: Wallet, paymaya: Wallet, grab_pay: Wallet, card: CreditCard, dob: Landmark, qrph: QrCode };
const statusText: Record<Exclude<CheckoutStatus, "open">, string> = {
  paid: "This checkout was already paid.", failed: "This payment failed.", cancelled: "This checkout was cancelled.", expired: "This checkout has expired.",
};
/** Demo expiry a few years ahead, so the test card never looks expired. */
const futureExpiry = () => { const date = new Date(); date.setFullYear(date.getFullYear() + 3); return `${String(date.getMonth() + 1).padStart(2, "0")} / ${String(date.getFullYear()).slice(-2)}`; };

const returnUrl = (checkout: PaymongoCheckoutDto) => `${checkout.returnPath}${checkout.returnPath.includes("?") ? "&" : "?"}checkout=${encodeURIComponent(checkout.sessionId)}`;

/** Simulated hosted checkout page: mimics the flow of a payment page without moving real money. */
export function PaymongoCheckout({ sessionId }: { sessionId: string }) {
  const [checkout, setCheckout] = useState<PaymongoCheckoutDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymongoMethod>("gcash");
  const [busy, setBusy] = useState<SimulatorAction["action"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/payments/paymongo/checkout/${encodeURIComponent(sessionId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => billingJson<{ checkout: PaymongoCheckoutDto }>(response))
      .then((result) => { if (!controller.signal.aborted) setCheckout(result.checkout); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : "Unable to load this checkout."); });
    return () => controller.abort();
  }, [sessionId]);

  async function run(action: SimulatorAction) {
    if (!checkout) return;
    setBusy(action.action); setError(null);
    try {
      const response = await fetch(`/api/payments/paymongo/checkout/${encodeURIComponent(sessionId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const result = await billingJson<{ checkout: PaymongoCheckoutDto }>(response);
      window.location.assign(returnUrl(result.checkout));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to complete this checkout.");
      setBusy(null);
    }
  }

  const open = checkout?.status === "open";
  return <div className="min-h-screen bg-stone-50 text-stone-950">
    <div role="note" className="sticky top-0 z-10 border-b border-red-900 bg-red-950 px-4 py-3 text-center text-sm font-semibold text-rose-100">
      <FlaskConical className="mr-2 inline h-4 w-4 align-text-bottom" aria-hidden="true" />Test mode — simulated PayMongo checkout. No real money is charged.
    </div>
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      {loadError ? <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Checkout unavailable</h1>
        <BillingErrorMessage message={loadError} />
        <Button asChild variant="outline"><Link href="/customer/billing"><ArrowLeft className="mr-2 h-4 w-4" />Return to billing</Link></Button>
      </section> : !checkout ? <p role="status" className="py-16 text-center text-sm text-stone-500">Loading checkout…</p> : <div className="space-y-4">
        <section className="min-w-0 rounded-xl bg-gradient-to-r from-red-950 to-red-800 p-5 text-white shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-rose-200">Pay to</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">G4 Builders Inc</h1>
          <p className="mt-4 break-words text-sm leading-6 text-rose-100">{checkout.description}</p>
          <p className="mt-1 break-words text-xs text-rose-200">Invoice {checkout.invoiceNumber}</p>
          <p className="mt-4 break-words text-4xl font-semibold tracking-tight tabular-nums">{formatPeso(checkout.amount)}</p>
        </section>

        {!open ? <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">{statusText[checkout.status as Exclude<CheckoutStatus, "open">]}</h2>
          {checkout.failureReason && <p className="text-sm text-stone-600">{checkout.failureReason}</p>}
          <Button asChild><Link href={returnUrl(checkout)}><ArrowLeft className="mr-2 h-4 w-4" />Return to billing</Link></Button>
        </section> : <section className="min-w-0 space-y-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <fieldset disabled={busy !== null} className="min-w-0">
            <legend className="text-sm font-semibold">Choose a payment method</legend>
            <div className="mt-3 grid gap-2">{paymongoMethods.map((item) => {
              const Icon = methodIcons[item];
              return <label key={item} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium transition has-[:checked]:border-red-700 has-[:checked]:bg-rose-50 has-[:checked]:ring-1 has-[:checked]:ring-red-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red-600 has-[:disabled]:opacity-60">
                <input type="radio" name="method" value={item} checked={method === item} onChange={() => setMethod(item)} className="h-4 w-4 shrink-0 accent-red-700" />
                <Icon className="h-5 w-5 shrink-0 text-red-700" aria-hidden="true" /><span className="min-w-0 break-words">{paymongoMethodLabels[item]}</span>
              </label>;
            })}</div>
          </fieldset>

          {method === "card" && <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm font-semibold">Test card (no real card used)</p>
            <label className="block text-xs font-semibold text-stone-600">Card number<input disabled readOnly value="4343 4343 4343 4345" autoComplete="off" className={field} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-stone-600">Expiry<input disabled readOnly value={futureExpiry()} autoComplete="off" className={field} /></label>
              <label className="block text-xs font-semibold text-stone-600">CVC<input disabled readOnly value="123" autoComplete="off" className={field} /></label>
            </div>
            <p className="text-xs leading-5 text-stone-500">These are demo values only. Real card details are never collected on this page.</p>
          </div>}

          <BillingErrorMessage message={error} />
          <div className="space-y-2">
            <Button className="min-h-11 w-full" disabled={busy !== null} onClick={() => void run({ action: "pay", method })}><ShieldCheck className="mr-2 h-4 w-4" />{busy === "pay" ? "Processing payment…" : `Pay ${formatPeso(checkout.amount)}`}</Button>
            <Button variant="outline" className="min-h-11 w-full" disabled={busy !== null} onClick={() => void run({ action: "fail", method })}>{busy === "fail" ? "Processing payment…" : "Simulate failed payment"}</Button>
            <Button variant="ghost" className="min-h-11 w-full" disabled={busy !== null} onClick={() => void run({ action: "cancel" })}>{busy === "cancel" ? "Cancelling…" : "Cancel and return"}</Button>
          </div>
          <p className="text-center text-xs leading-5 text-stone-500">Paying records the payment on your invoice automatically, just as a real online payment would. Use “Simulate failed payment” to see how a declined payment is handled.</p>
        </section>}
      </div>}
    </main>
  </div>;
}
