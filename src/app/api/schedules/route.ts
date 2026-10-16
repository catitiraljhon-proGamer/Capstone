import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { createSchedule, getCustomerSchedule, getStaffSchedule } from "@/lib/server/schedules";

/** Each role gets its own view: admin meetings, Billing Clerk payment dates and follow-ups, or a customer's own schedule. */
export async function GET(request: Request) {
  return designRequestApi(request, ["admin", "billing-clerk", "customer"], async (db, actor) =>
    NextResponse.json(actor.role === "customer" ? await getCustomerSchedule(db, actor) : await getStaffSchedule(db, actor)));
}

export async function POST(request: Request) {
  return designRequestApi(request, ["admin", "billing-clerk"], async (db, actor) =>
    NextResponse.json({ schedule: await createSchedule(db, actor, await request.json()) }, { status: 201 }));
}
