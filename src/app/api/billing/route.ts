import { NextResponse } from "next/server";
import { billingRequest } from "@/lib/server/billing-api";
import { getBillingData } from "@/lib/server/billing";
import { getClerkCashSummary } from "@/lib/server/cash-reports";
import { ensureVatRemoved } from "@/lib/server/vat-cleanup";
export async function GET(request: Request) {
  return billingRequest(request, true, async (db, actor) => {
    await ensureVatRemoved(db);
    const data = await getBillingData(db, actor);
    return NextResponse.json(actor.role === "billing-clerk" ? { ...data, ...await getClerkCashSummary(db, actor) } : data);
  });
}
