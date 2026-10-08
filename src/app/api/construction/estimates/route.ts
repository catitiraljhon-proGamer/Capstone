import { NextResponse } from "next/server";
import { createConstructionRequest, listEstimates } from "@/lib/server/construction";
import { designRequestApi } from "@/lib/server/design-request-api";

export async function GET(request: Request) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) => NextResponse.json({ estimates: await listEstimates(db, actor) }));
}

export async function POST(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) => NextResponse.json({
    estimate: await createConstructionRequest(db, actor, await request.json()),
  }, { status: 201 }));
}
