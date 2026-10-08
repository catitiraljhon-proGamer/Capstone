import { NextResponse } from "next/server";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { BillingError } from "@/lib/server/billing";
import { getDatabase } from "@/lib/database/mongodb";
import { readSession } from "@/lib/server/session";
import type { Db } from "mongodb";
import type { SessionUser, UserRole } from "@/types/domain";

export async function designRequestApi(request: Request, role: UserRole | UserRole[], work: (db: Db, actor: SessionUser) => Promise<Response>) {
  let response: Response;
  try {
    const actor = await readSession();
    if (!actor) response = unauthorized();
    else if (!(Array.isArray(role) ? role : [role]).includes(actor.role)) response = forbidden();
    else {
      const origin = request.headers.get("origin");
      if (request.method !== "GET" && (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin))) {
        throw new BillingError("Submit this request from the application.", 403);
      }
      response = await work(await getDatabase(), actor);
    }
  } catch (error) {
    response = error instanceof BillingError ? NextResponse.json({ error: error.message }, { status: error.status })
      : error instanceof SyntaxError ? NextResponse.json({ error: "Invalid request data." }, { status: 400 }) : apiError(error);
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
