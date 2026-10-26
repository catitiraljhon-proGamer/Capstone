import { getDatabase } from "@/lib/database/mongodb";
import { apiError, unauthorized } from "@/lib/server/api";
import { getMaterialNames } from "@/lib/server/materials";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

/** Material names only, suggested when a customer asks to change a material. Prices are never sent. */
export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    return NextResponse.json({ names: await getMaterialNames(await getDatabase()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
