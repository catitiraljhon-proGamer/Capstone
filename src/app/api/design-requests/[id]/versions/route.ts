import { NextResponse } from "next/server";
import { BillingError } from "@/lib/server/billing";
import { designRequestApi } from "@/lib/server/design-request-api";
import { uploadDesignVersion } from "@/lib/server/design-requests";

/** Stays under the hosting platform's 4.5 MB request body limit. */
const maxBodyLength = 4_400_000;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, "admin", async (db, actor) => {
    const { id } = await context.params;
    const body = await request.text();
    if (body.length > maxBodyLength) throw new BillingError("The images are too large together. Keep the total under 3 MB, or send fewer images.", 413);
    return NextResponse.json({ request: await uploadDesignVersion(db, actor, id, JSON.parse(body)) }, { status: 201 });
  });
}
