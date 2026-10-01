import { NextResponse } from "next/server";
import { MongoServerError } from "mongodb";
import { apiError, unauthorized } from "@/lib/server/api";
import { assertBillingRole, BillingError } from "@/lib/server/billing";
import { getDatabase } from "@/lib/database/mongodb";
import { readSession } from "@/lib/server/session";
import type { Db } from "mongodb";
import type { SessionUser } from "@/types/domain";

export async function billingRequest(
  request: Request,
  allowCustomer: boolean,
  handler: (db: Db, actor: SessionUser) => Promise<Response>,
) {
  try {
    const actor = await readSession();
    if (!actor) return unauthorized();
    assertBillingRole(actor, allowCustomer);
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
        throw new BillingError("Submit this request from the application.", 403);
      }
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new BillingError("Submit billing information as JSON.", 415);
    }
    const response = await handler(await getDatabase(), actor);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "This payment reference or submission already exists. Refresh the records before trying again." }, { status: 409 });
    return apiError(error);
  }
}

export async function billingBody(request: Request) {
  const body = await request.text();
  if (body.length > 1_050_000) throw new BillingError("The submission is too large. Use a proof image under 750 KB.", 413);
  return JSON.parse(body) as unknown;
}
