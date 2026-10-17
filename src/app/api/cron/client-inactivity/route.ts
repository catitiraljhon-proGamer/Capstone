import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { archiveInactiveClients } from "@/lib/server/client-inactivity";
import { isAuthorizedCronRequest } from "@/lib/server/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily: warns, then archives and disables clients with no open work for the Admin's set days after their last completed project. */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await archiveInactiveClients(await getDatabase());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
