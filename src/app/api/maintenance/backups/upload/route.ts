import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { receiveBackupUpload } from "@/lib/server/backup";
import { backupErrorResponse } from "@/lib/server/backup-api";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Receives a backup file one piece at a time; the last piece adds it to the list as an Uploaded backup. */
export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const result = await receiveBackupUpload(await getDatabase(), session, await request.json());
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return backupErrorResponse(error) ?? apiError(error);
  }
}
