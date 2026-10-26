import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { archiveInactiveClients } from "@/lib/server/client-inactivity";
import { isAuthorizedCronRequest } from "@/lib/server/cron";
import { closeRepairedClaims } from "@/lib/server/warranty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily: closes repaired warranty claims the customer never confirmed, then warns, archives, and disables clients with
 * no open work for the Admin's set days after their last project's warranty ended.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const db = await getDatabase();
    const { closed } = await closeRepairedClaims(db);
    const result = await archiveInactiveClients(db);
    return NextResponse.json({ ...result, warrantyClaimsClosed: closed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
