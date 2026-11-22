import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import { forbidden, unauthorized } from "@/lib/server/api";
import { AccountClosureError, closeAccount, getAccountClosure } from "@/lib/server/account-closure";
import { assertClientMutation, clientApiError } from "@/lib/server/client-api";
import { clearSessionCookie, readSession } from "@/lib/server/session";

function closureError(error: unknown) {
  if (error instanceof AccountClosureError) return NextResponse.json({ error: error.message }, { status: error.status });
  return clientApiError(error);
}

/** What still keeps the customer's account open, and the dates deactivating today would set. */
export async function GET() {
  try {
    const actor = await readSession();
    if (!actor) return unauthorized();
    if (actor.role !== "customer") return forbidden();
    return NextResponse.json({ closure: await getAccountClosure(await getDatabase(), actor) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return closureError(error);
  }
}

/** { action: "deactivate" | "delete", reason?, confirm? } — signs the customer out either way. */
export async function POST(request: Request) {
  try {
    const actor = await readSession();
    if (!actor) return unauthorized();
    if (actor.role !== "customer") return forbidden();
    assertClientMutation(request);
    const result = await closeAccount(await getDatabase(), actor, await request.json());
    const response = NextResponse.json(result);
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return closureError(error);
  }
}
