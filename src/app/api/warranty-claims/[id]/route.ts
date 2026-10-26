import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { changeWarrantyClaim, getWarrantyClaim } from "@/lib/server/warranty";

/** One claim with its photos. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) =>
    NextResponse.json({ claim: await getWarrantyClaim(db, actor, (await context.params).id) }));
}

/** Admin: schedule-inspection, record-inspection, schedule-repair, mark-repaired. Customer: confirm-repair. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) =>
    NextResponse.json({ claim: await changeWarrantyClaim(db, actor, (await context.params).id, await request.json()) }));
}
