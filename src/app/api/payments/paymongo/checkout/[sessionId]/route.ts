import { NextResponse } from "next/server";
import { billingBody, billingRequest } from "@/lib/server/billing-api";
import { getCheckout, simulateCheckout } from "@/lib/server/paymongo";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return billingRequest(request, true, async (db, actor) => NextResponse.json({ checkout: await getCheckout(db, actor, (await context.params).sessionId) }));
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return billingRequest(request, true, async (db, actor) => NextResponse.json({
    checkout: await simulateCheckout(db, actor, (await context.params).sessionId, await billingBody(request)),
  }));
}
