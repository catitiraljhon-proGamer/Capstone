import type { InvoiceDocument } from "@/lib/database/collections";

export const toCentavos = (amount: number) => Math.round(amount * 100);
export const fromCentavos = (amount: number) => amount / 100;
export const sumMoney = (amounts: number[]) => fromCentavos(amounts.reduce((sum, amount) => sum + toCentavos(amount), 0));
export const manilaDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

export function invoiceState(invoice: Pick<InvoiceDocument, "amount" | "status" | "dueDate">, paid: number, now = new Date()) {
  const balance = fromCentavos(Math.max(0, toCentavos(invoice.amount) - toCentavos(paid)));
  const overdue = !["Draft", "Ready", "Void"].includes(invoice.status) && balance > 0 && invoice.dueDate.toISOString().slice(0, 10) < manilaDate(now);
  if (["Draft", "Ready", "Void"].includes(invoice.status)) return { status: invoice.status, balance, overdue: false };
  return { status: balance === 0 ? "Paid" as const : paid > 0 ? "Partially Paid" as const : overdue ? "Overdue" as const : "Sent" as const, balance, overdue };
}
