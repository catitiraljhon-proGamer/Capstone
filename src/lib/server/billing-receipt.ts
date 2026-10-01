import type { BillingInvoice, BillingReceipt } from "@/types/billing";

const escape = (value: string | number) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
const date = (value: string) => new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" });

export function invoiceHtml(invoice: BillingInvoice) {
  const rows = [
    ["Invoice number", invoice.invoiceNumber], ["Customer", invoice.customerName], ["Project / design request", invoice.projectName],
    ["Billing stage", invoice.label], ["Billing basis", invoice.basis], ["Due date", invoice.dueDate],
    ["Invoice amount", money(invoice.amount)], ["Verified payments", money(invoice.paid)],
    ["Current balance", invoice.status === "Void" ? "—" : money(invoice.balance)], ["Status", invoice.status === "Sent" ? "Issued" : invoice.status],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(invoice.invoiceNumber)} · G4 Builders Inc</title><style>body{font:16px Arial,Helvetica,sans-serif;color:#1c1917;margin:40px auto;max-width:740px;padding:20px}h1{color:#b91c1c}table{width:100%;border-collapse:collapse}td{padding:12px 0;border-bottom:1px solid #e7e5e4;vertical-align:top}td:last-child{text-align:right;font-weight:600;max-width:400px;overflow-wrap:anywhere}footer{margin-top:30px;color:#57534e;font-size:13px}</style></head><body><p>G4 Builders Inc</p><h1>${invoice.designRequestId ? "Design Fee Invoice" : "Construction Invoice"}</h1>${invoice.status === "Void" ? `<p>VOID: ${escape(invoice.voidReason ?? "")}</p>` : ""}<table>${rows.map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join("")}</table><footer>Please coordinate payment instructions with the Billing Clerk. A receipt becomes available once your payment is verified.</footer></body></html>`;
}

export function receiptHtml(data: BillingReceipt) {
  const r = data.receipt;
  const rows = [
    ["Receipt number", r.number], ["Customer", r.customerName], ["Project / design request", r.projectName],
    ["Invoice", r.invoiceNumber], ["Billing stage", r.invoiceLabel], ["Payment date", date(r.paidAt)],
    ["Payment method", r.method], ["Transaction reference", r.transactionReference],
    ["Invoice amount", money(r.invoiceAmount)], ["Amount received", money(r.amount)],
    ["Invoice balance after this payment", money(r.balanceAfterPayment)],
    ["Verified by", r.verifiedByName], ["Receipt issued", date(r.issuedAt)],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(r.number)} · G4 Builders Inc</title><style>body{font:16px Arial,Helvetica,sans-serif;color:#1c1917;margin:40px auto;max-width:740px;padding:20px}h1{color:#b91c1c}table{width:100%;border-collapse:collapse}td{padding:12px 0;border-bottom:1px solid #e7e5e4;vertical-align:top}td:last-child{text-align:right;font-weight:600;max-width:400px;overflow-wrap:anywhere}.void{border:2px solid #b91c1c;padding:16px;color:#b91c1c}footer{margin-top:30px;color:#57534e;font-size:13px}@media print{body{margin:0;max-width:none}}</style></head><body><p>G4 Builders Inc</p><h1>Payment Receipt</h1>${data.status === "Reversed" ? `<p class="void"><strong>VOID — PAYMENT REVERSED</strong><br>${escape(data.reversalReason ?? "")}</p>` : ""}<table>${rows.map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join("")}</table><footer>This receipt acknowledges the verified payment above. The balance shown is the invoice balance at the time this receipt was issued. Subsequent payments and reversals appear in your payment history.</footer></body></html>`;
}
