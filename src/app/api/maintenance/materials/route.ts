import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { MaintenanceError } from "@/lib/server/maintenance";
import { createMaterial, getMaterials, updateMaterialPrices } from "@/lib/server/materials";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "private, no-store" };

function failure(error: unknown) {
  if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
  return apiError(error);
}

/** Admin only: every material with its price. */
export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json({ materials: await getMaterials(await getDatabase(), session) }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const materials = await createMaterial(await getDatabase(), session, await request.json());
    return NextResponse.json({ materials }, { status: 201, headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

/** Saves the prices typed in the list. */
export async function PATCH(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const materials = await updateMaterialPrices(await getDatabase(), session, await request.json());
    return NextResponse.json({ materials }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}
