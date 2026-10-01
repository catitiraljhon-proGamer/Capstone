import { NextResponse } from "next/server";
import { billingBody, billingRequest } from "@/lib/server/billing-api";
import { BillingError, changeInvoice, getBillingData } from "@/lib/server/billing";
import { invoiceHtml } from "@/lib/server/billing-receipt";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return billingRequest(request, true, async (db, actor) => {
    const { id } = await context.params;
    const invoice = (await getBillingData(db, actor)).invoices.find((item) => item.id === id);
    if (!invoice) throw new BillingError("Invoice not found.", 404);
    if (new URL(request.url).searchParams.get("download") === "1") {
      return new Response(invoiceHtml(invoice), { headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="' + invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "") + '.html"',
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      } });
    }
    return NextResponse.json(invoice);
  });
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return billingRequest(request, false, async (db, actor) => {
    await changeInvoice(db, actor, (await context.params).id, await billingBody(request));
    return NextResponse.json({ success: true });
  });
}
