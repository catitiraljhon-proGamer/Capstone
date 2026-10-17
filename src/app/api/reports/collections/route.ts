import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { getAdminCollectionsReport } from "@/lib/server/admin-reports";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const report = await getAdminCollectionsReport(await getDatabase());
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
