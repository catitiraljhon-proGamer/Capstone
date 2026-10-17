import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { backupCollections, backupPage, startBackup } from "@/lib/server/backup";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "private, no-store" };

/** Without a collection: the backup's collection list (and an audit entry). With one: a page of its records. */
export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const db = await getDatabase();
    const params = new URL(request.url).searchParams;
    const name = params.get("collection");
    if (!name) return NextResponse.json(await startBackup(db, session), { headers: noStore });
    const after = params.get("after") ?? undefined;
    if (!backupCollections.includes(name as (typeof backupCollections)[number]) || (after && !ObjectId.isValid(after))) {
      return NextResponse.json({ error: "Unknown backup request." }, { status: 400 });
    }
    return NextResponse.json(await backupPage(db, name, after), { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}
