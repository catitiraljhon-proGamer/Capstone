import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { acceptDesignRequestTerms } from "@/lib/server/design-request-terms";

export async function POST(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) => {
    const acceptance = await acceptDesignRequestTerms(db, actor, await request.json());
    return NextResponse.json({ acceptance }, { status: 201 });
  });
}
