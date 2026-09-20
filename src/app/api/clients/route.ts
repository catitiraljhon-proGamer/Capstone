import { getDatabase } from "@/lib/database/mongodb";
import { forbidden, unauthorized } from "@/lib/server/api";
import { assertClientMutation, clientApiError } from "@/lib/server/client-api";
import { createClient, listClients } from "@/lib/server/clients";
import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const actor = await readSession();
    if (!actor) return unauthorized();
    if (actor.role !== "admin") return forbidden();
    const query = Object.fromEntries(new URL(request.url).searchParams);
    return NextResponse.json(await listClients(await getDatabase(), actor, query), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) { return clientApiError(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await readSession();
    if (!actor) return unauthorized();
    if (actor.role !== "admin") return forbidden();
    assertClientMutation(request);
    const client = await createClient(await getDatabase(), actor, await request.json());
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) { return clientApiError(error); }
}
