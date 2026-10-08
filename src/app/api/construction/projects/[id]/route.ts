import { NextResponse } from "next/server";
import { changeProjectStatus } from "@/lib/server/construction";
import { designRequestApi } from "@/lib/server/design-request-api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, "admin", async (db, actor) => NextResponse.json(
    await changeProjectStatus(db, actor, (await context.params).id, await request.json()),
  ));
}
