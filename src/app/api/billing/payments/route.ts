import { NextResponse } from "next/server";
import { billingBody, billingRequest } from "@/lib/server/billing-api";
import { submitPayment } from "@/lib/server/billing";
export async function POST(request: Request) {
  return billingRequest(request, true, async (db, actor) => NextResponse.json({ id: await submitPayment(db, actor, await billingBody(request)) }, { status: 201 }));
}
