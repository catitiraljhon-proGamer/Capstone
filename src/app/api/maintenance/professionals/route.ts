import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { MaintenanceError } from "@/lib/server/maintenance";
import { createProfessional, getManagedProfessionals, reorderProfessionals } from "@/lib/server/professionals";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "private, no-store" };

function failure(error: unknown) {
  if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
  return apiError(error);
}

/** Admin only: every architect and engineer, hidden ones included. */
export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json({ professionals: await getManagedProfessionals(await getDatabase(), session) }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const professionals = await createProfessional(await getDatabase(), session, await request.json());
    return NextResponse.json({ professionals }, { status: 201, headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

/** Saves the order the About Us page lists them in. */
export async function PUT(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const professionals = await reorderProfessionals(await getDatabase(), session, await request.json());
    return NextResponse.json({ professionals }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}
