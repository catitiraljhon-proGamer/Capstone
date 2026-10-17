import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { backupList, createBackup } from "@/lib/server/backup";
import { backupErrorResponse } from "@/lib/server/backup-api";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;
const noStore = { "Cache-Control": "private, no-store" };

/** Admin only: saved backups, newest first. */
export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json(await backupList(), { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

/** Back up now: saves a manual backup to the list. */
export async function POST() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const backup = await createBackup(await getDatabase(), session, "manual");
    return NextResponse.json({ backup }, { status: 201, headers: noStore });
  } catch (error) {
    return backupErrorResponse(error) ?? apiError(error);
  }
}
