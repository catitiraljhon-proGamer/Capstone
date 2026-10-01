import { NextResponse } from "next/server";
import { billingRequest } from "@/lib/server/billing-api";
import { getBillingData } from "@/lib/server/billing";
import { manilaDate, sumMoney } from "@/lib/billing";

export async function GET(request: Request) {
  return billingRequest(request, false, async (db, actor) => {
    const data = await getBillingData(db, actor);
    const unpaid = data.invoices.filter((invoice) => !["Draft", "Ready", "Void"].includes(invoice.status) && invoice.balance > 0);
    return NextResponse.json({
      pendingBillings: unpaid.length,
      collectedThisMonth: sumMoney(data.payments.filter((payment) => payment.status === "Verified" && manilaDate(new Date(payment.paidAt)).startsWith(manilaDate().slice(0, 7))).map((payment) => payment.amount)),
      overdueAccounts: new Set(unpaid.filter((invoice) => invoice.overdue).map((invoice) => invoice.customerId)).size,
      invoicesReady: data.invoices.filter((invoice) => ["Draft", "Ready"].includes(invoice.status)).length,
      queueItems: unpaid.slice(0, 8).map((invoice) => ({ title: invoice.invoiceNumber, meta: invoice.customerName, amount: invoice.balance, status: invoice.status })),
      activityItems: data.activity.map((activity) => ({ title: activity.action, body: activity.actorName, date: activity.date })),
    });
  });
}
