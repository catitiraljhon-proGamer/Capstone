import { getDatabase } from "@/lib/database/mongodb";
import { forbidden, unauthorized } from "@/lib/server/api";
import { assertClientMutation, clientApiError } from "@/lib/server/client-api";
import { updateClient } from "@/lib/server/clients";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await readSession();
    if (!actor) return unauthorized();
    if (actor.role !== "admin") return forbidden();
    assertClientMutation(request);
    const { id } = await context.params;
    const client = await updateClient(await getDatabase(), actor, id, await request.json());
    return NextResponse.json({ client });
  } catch (error) { return clientApiError(error); }
}
