import { NextResponse } from "next/server";
import { billingBody, billingRequest } from "@/lib/server/billing-api";
import { createCheckout } from "@/lib/server/paymongo";

export async function POST(request: Request) {
  return billingRequest(request, true, async (db, actor) => NextResponse.json({ checkout: await createCheckout(db, actor, await billingBody(request)) }, { status: 201 }));
}
