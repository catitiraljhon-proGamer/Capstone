import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { MaintenanceError } from "@/lib/server/maintenance";
import { removeProfessional, updateProfessional } from "@/lib/server/professionals";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ id: string }> };

const noStore = { "Cache-Control": "private, no-store" };

function failure(error: unknown) {
  if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
  return apiError(error);
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const { id } = await context.params;
    const professionals = await updateProfessional(await getDatabase(), session, id, await request.json());
    return NextResponse.json({ professionals }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const { id } = await context.params;
    const professionals = await removeProfessional(await getDatabase(), session, id);
    return NextResponse.json({ professionals }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}
