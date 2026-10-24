import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { getAccountTermsVersion, getAccountTermsView, publishAccountTerms } from "@/lib/server/account-terms";
import { MaintenanceError } from "@/lib/server/maintenance";
import { readSession } from "@/lib/server/session";
import { NextResponse, type NextRequest } from "next/server";

const noStore = { "Cache-Control": "private, no-store" };

/** Admin only: the current terms and every published version, or one version's text with `?version=`. */
export async function GET(request: NextRequest) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    const db = await getDatabase();
    const version = request.nextUrl.searchParams.get("version");
    return NextResponse.json(version ? await getAccountTermsVersion(db, version) : await getAccountTermsView(db), { headers: noStore });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}

/** Publishes the edited terms as a new version. */
export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.json(await publishAccountTerms(await getDatabase(), session, await request.json()), { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof MaintenanceError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
