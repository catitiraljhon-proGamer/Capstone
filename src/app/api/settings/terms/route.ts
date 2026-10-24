import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { getCurrentTerms } from "@/lib/server/account-terms";
import { NextResponse } from "next/server";

/** Public: the Terms and Conditions shown on the home, login, and register pages and to customers who have not agreed. */
export async function GET() {
  try {
    return NextResponse.json(await getCurrentTerms(await getDatabase()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
