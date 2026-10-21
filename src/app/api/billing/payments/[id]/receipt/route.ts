import { NextResponse } from "next/server";
import { billingRequest } from "@/lib/server/billing-api";
import { getReceipt } from "@/lib/server/billing";
import { receiptHtml } from "@/lib/server/billing-receipt";
import { getContactDetails } from "@/lib/server/contact-details";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return billingRequest(request, true, async (db, actor) => {
    const data = await getReceipt(db, actor, (await context.params).id);
    if (new URL(request.url).searchParams.get("download") === "1") {
      const origin = new URL(request.url).origin;
      return new Response(receiptHtml(data, await getContactDetails(db), origin + "/G4/image.png"), { headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="' + data.receipt.number + '.html"',
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src " + origin + "; sandbox",
      } });
    }
    return NextResponse.json(data);
  });
}
