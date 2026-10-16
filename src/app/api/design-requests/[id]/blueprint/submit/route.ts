import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { submitBlueprint } from "@/lib/server/design-requests";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, "admin", async (db, actor) => {
    const { id } = await context.params;
    return NextResponse.json({ blueprint: await submitBlueprint(db, actor, id) });
  });
}
