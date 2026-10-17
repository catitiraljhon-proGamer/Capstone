import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { restoreBackup } from "@/lib/server/backup";
import { backupErrorResponse } from "@/lib/server/backup-api";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Replaces every record with this backup. Requires the Admin's password; everyone is signed out afterwards. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const { id } = await context.params;
    const result = await restoreBackup(await getDatabase(), session, id, await request.json());
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return backupErrorResponse(error) ?? apiError(error);
  }
}
