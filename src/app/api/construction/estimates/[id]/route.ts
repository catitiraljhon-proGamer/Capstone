import { NextResponse } from "next/server";
import { changeEstimate, getEstimate } from "@/lib/server/construction";
import { designRequestApi } from "@/lib/server/design-request-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) => NextResponse.json({
    estimate: await getEstimate(db, actor, (await context.params).id),
  }));
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) => NextResponse.json(
    await changeEstimate(db, actor, (await context.params).id, await request.json()),
  ));
}
