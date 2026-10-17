import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { runDailyBackup } from "@/lib/server/backup";
import { backupErrorResponse } from "@/lib/server/backup-api";
import { isAuthorizedCronRequest } from "@/lib/server/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily at 1:00 AM Manila time: saves an automatic backup when the Admin has them on, keeping only the newest few. */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return NextResponse.json(await runDailyBackup(await getDatabase()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return backupErrorResponse(error) ?? apiError(error);
  }
}
