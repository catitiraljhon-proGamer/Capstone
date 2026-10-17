import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { getSystemSettingsView, MaintenanceError, updateSystemSettings } from "@/lib/server/maintenance";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "private, no-store" };

/** Admin only: the system settings with who changed each one last. */
export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json(await getSystemSettingsView(await getDatabase()), { headers: noStore });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json(await updateSystemSettings(await getDatabase(), session, await request.json()), { headers: noStore });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
