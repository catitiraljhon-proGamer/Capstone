import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { reviewMeetingRequest } from "@/lib/server/schedules";

/** `cancel` for the customer who asked; `approve` or `decline` for the admin. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, ["admin", "customer"], async (db, actor) => {
    const { id } = await context.params;
    return NextResponse.json(await reviewMeetingRequest(db, actor, id, await request.json()));
  });
}
