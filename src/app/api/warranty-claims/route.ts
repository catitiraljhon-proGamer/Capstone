import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { createWarrantyClaim, listWarrantyClaims } from "@/lib/server/warranty";

/** Customers: their own claims and the problem types they can report. Admin: every claim. */
export async function GET(request: Request) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) => NextResponse.json(await listWarrantyClaims(db, actor)));
}

/** Customers report a problem with their completed house. */
export async function POST(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) =>
    NextResponse.json({ claim: await createWarrantyClaim(db, actor, await request.json()) }, { status: 201 }));
}
