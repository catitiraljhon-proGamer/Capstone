import { NextResponse } from "next/server";
import { acceptAccountTerms, getAccountTermsAcceptance, getCurrentTerms } from "@/lib/server/account-terms";
import { designRequestApi } from "@/lib/server/design-request-api";

export async function GET(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) => {
    const acceptance = await getAccountTermsAcceptance(db, actor.id);
    return NextResponse.json({
      accepted: Boolean(acceptance), version: (await getCurrentTerms(db)).version,
      ...(acceptance ? { acceptedAt: acceptance.acceptedAt.toISOString() } : {}),
    });
  });
}

export async function POST(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) => {
    const acceptance = await acceptAccountTerms(db, actor, await request.json());
    return NextResponse.json({ acceptance }, { status: 201 });
  });
}
