import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { sendDuePaymentReminders } from "@/lib/server/payment-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called once a day by Vercel Cron (see vercel.json). With CRON_SECRET set, Vercel sends it as a bearer token and
 * any other caller is refused. Without it, only Vercel's cron agent is accepted; the job is safe to repeat either way
 * because each invoice is reminded once per due date.
 */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  return (request.headers.get("user-agent") ?? "").startsWith("vercel-cron/");
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await sendDuePaymentReminders(await getDatabase());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
