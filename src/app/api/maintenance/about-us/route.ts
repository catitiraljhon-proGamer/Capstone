import { getDatabase } from "@/lib/database/mongodb";
import { getAboutUsView, updateAboutUsContent } from "@/lib/server/about-us";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { MaintenanceError } from "@/lib/server/maintenance";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "private, no-store" };

/** Admin only: the About Us page text and who last saved it. */
export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json(await getAboutUsView(await getDatabase(), session), { headers: noStore });
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
    return NextResponse.json(await updateAboutUsContent(await getDatabase(), session, await request.json()), { headers: noStore });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
