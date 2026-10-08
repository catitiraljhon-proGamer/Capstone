/**
 * PayMongo online payments, run as a SIMULATION: no real money moves and no
 * PayMongo account is needed. The app creates PayMongo-shaped checkout
 * sessions, shows a clearly labelled test checkout page, and delivers a
 * PayMongo-shaped, HMAC-signed webhook event to its own webhook handler — the
 * same handler a real PayMongo webhook would hit. A verified webhook records a
 * Verified payment with a receipt through the normal billing verification path,
 * so invoices, design unlocks, and construction project statuses update exactly
 * as they do when the Billing Clerk verifies a payment.
 *
 * API contract (JSON; errors are `{ error: string }`):
 * - POST /api/payments/paymongo/checkout                 customer: CreateCheckoutInput → { checkout: PaymongoCheckoutDto }
 * - GET  /api/payments/paymongo/checkout/[sessionId]     owning customer (or billing clerk) → { checkout: PaymongoCheckoutDto }
 * - POST /api/payments/paymongo/checkout/[sessionId]     owning customer: SimulatorAction → { checkout: PaymongoCheckoutDto }
 *        (the test checkout page's "Pay" / "Fail" / "Cancel" buttons; "pay" and "fail" build and sign a webhook event
 *         and pass it to the same handler as the public webhook route)
 * - POST /api/payments/paymongo/webhook                  public, raw body + `Paymongo-Signature` header → { received: true }
 *
 * Pages:
 * - /customer/checkout/[sessionId]   simulated hosted checkout (owning customer only)
 * - success/cancel return to `returnPath` (e.g. /customer/billing) with `?checkout=<sessionId>`
 */

/** PayMongo `payment_method_types` values offered on the test checkout. */
export const paymongoMethods = ["gcash", "paymaya", "grab_pay", "card", "dob", "qrph"] as const;
export type PaymongoMethod = (typeof paymongoMethods)[number];

export const paymongoMethodLabels: Record<PaymongoMethod, string> = {
  gcash: "GCash",
  paymaya: "Maya",
  grab_pay: "GrabPay",
  card: "Credit / debit card",
  dob: "Online banking",
  qrph: "QR Ph",
};

/** PayMongo's minimum checkout amount is PHP 20.00. */
export const PAYMONGO_MIN_AMOUNT = 20;

export type CheckoutStatus = "open" | "paid" | "failed" | "cancelled" | "expired";

export type PaymongoCheckoutDto = {
  /** PayMongo-style id, e.g. "cs_sim_3f9a…" — unguessable. */
  sessionId: string;
  status: CheckoutStatus;
  invoiceId: string;
  invoiceNumber: string;
  invoiceLabel: string;
  description: string;
  amount: number;
  /** Simulated hosted checkout URL (path within this app). */
  checkoutUrl: string;
  /** Where the customer returns after paying or cancelling. */
  returnPath: string;
  /** Method chosen on the checkout page, once paid or failed. */
  method: PaymongoMethod | null;
  /** PayMongo payment id ("pay_sim_…") once paid. */
  paymentId: string | null;
  /** Our PaymentDocument id once the webhook recorded it. */
  billingPaymentId: string | null;
  /** True when the payment was recorded but held for Billing Clerk review (e.g. it exceeded the remaining balance). */
  heldForReview: boolean;
  failureReason: string | null;
  livemode: false;
  expiresAt: string;
  createdAt: string;
};

export type CreateCheckoutInput = {
  invoiceId: string;
  /** Defaults to the invoice's full remaining balance. Must be ≥ PHP 20 and ≤ the balance. */
  amount?: number;
  /** App path to return to; must start with "/customer/". Defaults to "/customer/billing". */
  returnPath?: string;
};

export type SimulatorAction =
  | { action: "pay"; method: PaymongoMethod }
  | { action: "fail"; method: PaymongoMethod }
  | { action: "cancel" };
