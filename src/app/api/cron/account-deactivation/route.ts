import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { processDeactivatedAccounts } from "@/lib/server/account-closure";
import { isAuthorizedCronRequest } from "@/lib/server/cron";
import { closeRepairedClaims } from "@/lib/server/warranty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily: closes repaired warranty claims the customer never confirmed, then emails the last reminder to deactivated
 * customers and deletes the accounts whose deletion date has come (Admin settings in Maintenance).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const db = await getDatabase();
    const { closed } = await closeRepairedClaims(db);
    const result = await processDeactivatedAccounts(db);
    return NextResponse.json({ ...result, warrantyClaimsClosed: closed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
