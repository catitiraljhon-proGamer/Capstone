import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { isAuthorizedCronRequest } from "@/lib/server/cron";
import { sendDuePaymentReminders } from "@/lib/server/payment-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily: reminds customers about unpaid invoices due within the Admin's set days. Each invoice is reminded once per due date. */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await sendDuePaymentReminders(await getDatabase());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
