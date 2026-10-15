import { NextResponse } from "next/server";
import { BillingError } from "@/lib/server/billing";
import { designRequestApi } from "@/lib/server/design-request-api";
import { uploadBlueprintFile } from "@/lib/server/design-requests";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, "admin", async (db, actor) => {
    const { id } = await context.params;
    const body = await request.text();
    if (body.length > 4_200_000) throw new BillingError("Each blueprint file must be 3 MB or smaller.", 413);
    return NextResponse.json({ file: await uploadBlueprintFile(db, actor, id, JSON.parse(body)) }, { status: 201 });
  });
}
