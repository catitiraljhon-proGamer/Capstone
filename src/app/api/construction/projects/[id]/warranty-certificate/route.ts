import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { getWarrantyCertificate } from "@/lib/server/warranty";

/** The printable warranty certificate of a completed project: the homeowner's own, or any for the Admin. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) =>
    NextResponse.json(await getWarrantyCertificate(db, actor, (await context.params).id)));
}
