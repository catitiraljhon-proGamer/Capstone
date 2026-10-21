import { defaultContactDetails, type ContactDetails } from "@/lib/contact-details";
import { designFeeLabels, type BillingInvoice, type BillingReceipt } from "@/types/billing";

const escape = (value: string | number) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
const date = (value: string) => new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" });

export function invoiceHtml(invoice: BillingInvoice) {
  const rows = [
    ["Invoice Number", invoice.invoiceNumber], ["Customer", invoice.customerName], ["Project / Design Request", invoice.projectName],
    ["Billing Stage", invoice.label], ["Billing Basis", invoice.basis], ["Due Date", invoice.dueDate],
    ["Invoice Amount", money(invoice.amount)], ["Verified Payments", money(invoice.paid)],
    ["Current Balance", invoice.status === "Void" ? "—" : money(invoice.balance)], ["Status", invoice.status === "Sent" ? "Issued" : invoice.status],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(invoice.invoiceNumber)} · G4 Builders Inc</title><style>body{font:16px Arial,Helvetica,sans-serif;color:#1c1917;margin:40px auto;max-width:740px;padding:20px}h1{color:#b91c1c}table{width:100%;border-collapse:collapse}td{padding:12px 0;border-bottom:1px solid #e7e5e4;vertical-align:top}td:last-child{text-align:right;font-weight:600;max-width:400px;overflow-wrap:anywhere}footer{margin-top:30px;color:#57534e;font-size:13px}</style></head><body><p>G4 Builders Inc</p><h1>${invoice.designRequestId ? `${designFeeLabels[invoice.feeType ?? "design"]} Invoice` : "Construction Invoice"}</h1>${invoice.status === "Void" ? `<p>VOID: ${escape(invoice.voidReason ?? "")}</p>` : ""}<table>${rows.map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join("")}</table><footer>Please coordinate payment instructions with the Billing Clerk. A receipt becomes available once your payment is verified.</footer></body></html>`;
}

/** Same letterhead layout as the on-screen receipt; `logoUrl` must be absolute so the saved file still shows the logo. */
export function receiptHtml(data: BillingReceipt, contact: ContactDetails = defaultContactDetails, logoUrl?: string) {
  const r = data.receipt;
  const summary = [
    ["Invoice amount", money(r.invoiceAmount)],
    ["Paid before this payment", money(Math.max(r.invoiceAmount - r.balanceAfterPayment - r.amount, 0))],
    ["Balance after this payment", money(r.balanceAfterPayment)],
  ];
  const styles = "*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font:14px Arial,Helvetica,sans-serif;color:#0c0a09;margin:40px auto;max-width:760px;padding:20px}"
    + ".logo{width:176px;height:auto}.company{margin:16px 0 4px;font-size:24px;font-weight:600;letter-spacing:-.02em}.muted{color:#57534e;font-size:12px;margin:0}"
    + ".top{display:flex;flex-wrap:wrap;gap:24px;margin-top:32px}.top>div{flex:1 1 280px;min-width:0}.label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#78716c;margin:0}"
    + ".customer{font-size:18px;font-weight:600;margin:8px 0 4px}h1{margin:0;background:#b91c1c;color:#fff;padding:12px 16px;font-size:20px;letter-spacing:-.02em;overflow-wrap:anywhere}.date{margin:0;background:#f5f5f4;padding:8px 16px;font-size:12px;color:#57534e}"
    + ".void{border:2px solid #b91c1c;border-radius:8px;padding:16px;color:#991b1b;margin-top:24px}table{width:100%;border-collapse:collapse;margin-top:32px;text-align:left}"
    + "th{background:#b91c1c;color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding:10px 12px}td{padding:12px;border-bottom:1px solid #e7e5e4;vertical-align:top}.right{text-align:right}.strong{font-weight:600}"
    + ".bottom{display:flex;flex-wrap:wrap;gap:32px;margin-top:40px}.bottom>div{flex:1 1 280px}h2{font-size:18px;margin:0 0 12px;letter-spacing:-.02em}dl{margin:0;border-top:1px solid #e7e5e4}"
    + "dl div{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #e7e5e4}dt{color:#57534e}dd{margin:0}.total dt,.total dd{color:#0c0a09;font-weight:600}"
    + "footer{margin-top:40px;padding-top:20px;border-top:1px solid #e7e5e4;color:#78716c;font-size:12px;line-height:1.6}@media print{body{margin:0;max-width:none;padding:0}}";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(r.number)} · G4 Builders Inc</title><style>${styles}</style></head><body>`
    + `<header>${logoUrl ? `<img class="logo" src="${escape(logoUrl)}" alt="G4 Builders Inc">` : ""}<p class="company">G4 Builders Inc</p><p class="muted">${escape(contact.address)}</p><p class="muted">${escape(contact.phone)} | ${escape(contact.email)}</p></header>`
    + `<section class="top"><div><p class="label">Recipient:</p><p class="customer">${escape(r.customerName)}</p><p class="muted">${escape(r.projectName)}</p></div><div><h1>Receipt for #${escape(r.number)}</h1><p class="date">Transaction date: ${escape(date(r.paidAt))}</p></div></section>`
    + (data.status === "Reversed" ? `<p class="void"><strong>VOID — PAYMENT REVERSED</strong><br>${escape(data.reversalReason ?? "")}</p>` : "")
    + `<table><thead><tr><th>Billing stage</th><th>Description</th><th>Method</th><th class="right">Amount</th></tr></thead><tbody><tr><td class="strong">${escape(r.invoiceLabel)}</td><td>Payment for invoice ${escape(r.invoiceNumber)}<br>Reference: ${escape(r.transactionReference || "—")}</td><td>${escape(r.method)}</td><td class="right strong">${escape(money(r.amount))}</td></tr></tbody></table>`
    + `<section class="bottom"><div><p class="muted" style="font-size:14px">Thank you for your payment!</p><p class="muted" style="margin-top:12px">Verified by ${escape(r.verifiedByName)}<br>Receipt issued ${escape(date(r.issuedAt))}</p></div>`
    + `<div><h2>Receipt for Payment</h2><dl>${summary.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}<div class="total"><dt>Amount received</dt><dd>${escape(money(r.amount))}</dd></div></dl></div></section>`
    + `<footer>This receipt acknowledges the verified payment above. The balance shown is the invoice balance at the time this receipt was issued. Subsequent payments and reversals appear in your payment history.</footer></body></html>`;
}
