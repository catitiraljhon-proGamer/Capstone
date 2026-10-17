import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { applyMaintenance, getMaintenanceData, MaintenanceError } from "@/lib/server/maintenance";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json(await getMaintenanceData(await getDatabase()), { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const db = await getDatabase();
    await applyMaintenance(db, session, await request.json());
    return NextResponse.json(await getMaintenanceData(db), { headers: noStore });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
