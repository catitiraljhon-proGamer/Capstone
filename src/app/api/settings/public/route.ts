import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { getPublicSettings } from "@/lib/server/maintenance";
import { NextResponse } from "next/server";

/** Public: sign-up forms show the password rules, and signed-in pages read the inactivity sign-out time. */
export async function GET() {
  try {
    return NextResponse.json(await getPublicSettings(await getDatabase()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
