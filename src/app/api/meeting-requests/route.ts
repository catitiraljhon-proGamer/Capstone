import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { requestMeeting } from "@/lib/server/schedules";

export async function POST(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) =>
    NextResponse.json({ request: await requestMeeting(db, actor, await request.json()) }, { status: 201 }));
}
