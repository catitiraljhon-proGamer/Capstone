import { NextResponse } from "next/server";
import { billingBody, roleRequest } from "@/lib/server/billing-api";
import { listCashReports, submitCashReport } from "@/lib/server/cash-reports";

/** The Admin's daily cash reports; role checks live in listCashReports. */
export async function GET(request: Request) {
  return roleRequest(request, () => {}, async (db, actor) => NextResponse.json({ reports: await listCashReports(db, actor) }));
}

/** The Billing Clerk submits the counted cash total; role checks live in submitCashReport. */
export async function POST(request: Request) {
  return roleRequest(request, () => {}, async (db, actor) => NextResponse.json({ id: await submitCashReport(db, actor, await billingBody(request)) }, { status: 201 }));
}
