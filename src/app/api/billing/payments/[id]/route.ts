import { NextResponse } from "next/server";
import { billingBody, billingRequest } from "@/lib/server/billing-api";
import { reviewPayment } from "@/lib/server/billing";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return billingRequest(request, false, async (db, actor) => {
    await reviewPayment(db, actor, (await context.params).id, await billingBody(request));
    return NextResponse.json({ success: true });
  });
}
