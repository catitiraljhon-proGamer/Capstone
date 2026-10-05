import { NextResponse } from "next/server";
import { createDesignRequest } from "@/lib/server/create-design-request";
import { listCustomerDesigns } from "@/lib/server/design-requests";
import { designRequestApi } from "@/lib/server/design-request-api";

export async function GET(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) => NextResponse.json({ requests: await listCustomerDesigns(db, actor) }));
}

export async function POST(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) => NextResponse.json({
    request: await createDesignRequest(db, actor, await request.json()),
  }, { status: 201 }));
}
