import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { MaintenanceError } from "@/lib/server/maintenance";
import { getProfessionalDesigns } from "@/lib/server/professionals";
import { NextResponse } from "next/server";

/** Public: the newest Published designs credited to a person on the About Us page, one cover photo each. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const designs = await getProfessionalDesigns(await getDatabase(), id);
    return NextResponse.json({ designs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
