import { NextResponse } from "next/server";
import { apiError } from "@/lib/server/api";
import { BillingError } from "@/lib/server/billing";
import { getDatabase } from "@/lib/database/mongodb";
import { handlePaymongoWebhook } from "@/lib/server/paymongo";

const MAX_BODY_BYTES = 64 * 1024;

/** Public endpoint: PayMongo (or the checkout simulator) authenticates with the `Paymongo-Signature` header, not a session. */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) throw new BillingError("The event is too large.", 413);
    const result = await handlePaymongoWebhook(await getDatabase(), rawBody, request.headers.get("paymongo-signature"));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
}
