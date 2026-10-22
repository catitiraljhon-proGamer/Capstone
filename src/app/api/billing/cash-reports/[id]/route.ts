import { NextResponse } from "next/server";
import { billingBody, roleRequest } from "@/lib/server/billing-api";
import { verifyCashReport } from "@/lib/server/cash-reports";

/** The Admin verifies a daily cash report; role checks live in verifyCashReport. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return roleRequest(request, () => {}, async (db, actor) => {
    await verifyCashReport(db, actor, (await context.params).id, await billingBody(request));
    return NextResponse.json({ success: true });
  });
}
