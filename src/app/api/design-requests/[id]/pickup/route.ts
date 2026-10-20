import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { requestBlueprintPickup } from "@/lib/server/schedules";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, "customer", async (db, actor) => {
    const { id } = await context.params;
    return NextResponse.json({ request: await requestBlueprintPickup(db, actor, id, await request.json()) }, { status: 201 });
  });
}
