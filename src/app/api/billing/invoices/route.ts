import { NextResponse } from "next/server";
import { billingBody, billingRequest } from "@/lib/server/billing-api";
import { createInvoice } from "@/lib/server/billing";
export async function POST(request: Request) {
  return billingRequest(request, false, async (db, actor) => NextResponse.json({ id: await createInvoice(db, actor, await billingBody(request)) }, { status: 201 }));
}
