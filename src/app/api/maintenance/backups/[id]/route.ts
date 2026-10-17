import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { deleteBackup, readBackupChunk } from "@/lib/server/backup";
import { backupErrorResponse } from "@/lib/server/backup-api";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const noStore = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };

/** One piece of the backup file (?chunk=0, 1, …); the page joins them into the download. */
export async function GET(request: Request, context: Context) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const { id } = await context.params;
    const chunk = new URL(request.url).searchParams.get("chunk") ?? "0";
    return NextResponse.json(await readBackupChunk(id, chunk), { headers: noStore });
  } catch (error) {
    return backupErrorResponse(error) ?? apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const { id } = await context.params;
    await deleteBackup(await getDatabase(), session, id);
    return NextResponse.json({ deleted: true }, { headers: noStore });
  } catch (error) {
    return backupErrorResponse(error) ?? apiError(error);
  }
}
