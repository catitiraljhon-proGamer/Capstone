import { NextResponse } from "next/server";
import { billingRequest } from "@/lib/server/billing-api";
import { getBillingData } from "@/lib/server/billing";
export async function GET(request: Request) {
  return billingRequest(request, true, async (db, actor) => NextResponse.json(await getBillingData(db, actor)));
}
