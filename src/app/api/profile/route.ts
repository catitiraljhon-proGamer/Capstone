import { getDatabase } from "@/lib/database/mongodb";
import { forbidden, unauthorized } from "@/lib/server/api";
import { assertClientMutation, clientApiError } from "@/lib/server/client-api";
import { getClient, updateClient } from "@/lib/server/clients";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const actor = await readSession();
    if (!actor) return unauthorized();
    if (actor.role !== "customer") return forbidden();
    return NextResponse.json({ client: await getClient(await getDatabase(), actor, actor.id) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) { return clientApiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await readSession();
    if (!actor) return unauthorized();
    if (actor.role !== "customer") return forbidden();
    assertClientMutation(request);
    const client = await updateClient(await getDatabase(), actor, actor.id, await request.json());
    return NextResponse.json({ client });
  } catch (error) { return clientApiError(error); }
}
