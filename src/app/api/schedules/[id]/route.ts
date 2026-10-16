import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { updateScheduleStatus } from "@/lib/server/schedules";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, ["admin", "billing-clerk"], async (db, actor) => {
    const { id } = await context.params;
    return NextResponse.json({ schedule: await updateScheduleStatus(db, actor, id, await request.json()) });
  });
}
