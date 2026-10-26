import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { MaintenanceError } from "@/lib/server/maintenance";
import { readSession } from "@/lib/server/session";
import { getWarrantyListsView, updateWarrantyLists } from "@/lib/server/warranty-settings";
import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "private, no-store" };

/** Admin only: the warranty problem types and not-covered reasons, and who last saved them. */
export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json(await getWarrantyListsView(await getDatabase(), session), { headers: noStore });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json(await updateWarrantyLists(await getDatabase(), session, await request.json()), { headers: noStore });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
