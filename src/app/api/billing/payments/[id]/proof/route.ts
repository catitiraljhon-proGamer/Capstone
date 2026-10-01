import { billingRequest } from "@/lib/server/billing-api";
import { BillingError, getOwnedPayment } from "@/lib/server/billing";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return billingRequest(request, true, async (db, actor) => {
    const payment = await getOwnedPayment(db, actor, (await context.params).id);
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(payment.proofImage ?? "");
    if (!match) throw new BillingError("Payment proof not found.", 404);
    return new Response(Buffer.from(match[2], "base64"), {
      headers: { "Content-Type": match[1], "Content-Security-Policy": "default-src 'none'; sandbox" },
    });
  });
}
