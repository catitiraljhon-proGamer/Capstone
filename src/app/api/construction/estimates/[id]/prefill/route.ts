import { NextResponse } from "next/server";
import { prefillEstimate } from "@/lib/server/construction";
import { designRequestApi } from "@/lib/server/design-request-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, "admin", async (db, actor) => NextResponse.json(
    await prefillEstimate(db, actor, (await context.params).id),
  ));
}
