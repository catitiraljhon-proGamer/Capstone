import { NextResponse } from "next/server";
import { billingRequest } from "@/lib/server/billing-api";
import { getBillingData } from "@/lib/server/billing";
import { ensureVatRemoved } from "@/lib/server/vat-cleanup";
export async function GET(request: Request) {
  return billingRequest(request, true, async (db, actor) => {
    await ensureVatRemoved(db);
    return NextResponse.json(await getBillingData(db, actor));
  });
}
