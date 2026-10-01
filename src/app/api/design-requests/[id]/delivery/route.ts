import { NextResponse } from "next/server";
import { BillingError } from "@/lib/server/billing";
import { designRequestApi } from "@/lib/server/design-request-api";
import { deliverDesign } from "@/lib/server/design-requests";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, "admin", async (db, actor) => {
    const { id } = await context.params;
    const body = await request.text();
    if (body.length > 6_310_000) throw new BillingError("Upload at most six images, under 750 KB each.", 413);
    return NextResponse.json({ request: await deliverDesign(db, actor, id, JSON.parse(body)) });
  });
}
