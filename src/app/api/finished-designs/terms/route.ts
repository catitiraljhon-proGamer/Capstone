import { NextResponse } from "next/server";
import { finishedDesignsTerms } from "@/lib/finished-designs-terms";
import { designRequestApi } from "@/lib/server/design-request-api";
import {
  acceptFinishedDesignsTerms,
  hasAcceptedFinishedDesignsTerms,
} from "@/lib/server/finished-designs-terms";

export async function GET(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) =>
    NextResponse.json({
      accepted: await hasAcceptedFinishedDesignsTerms(db, actor.id),
      version: finishedDesignsTerms.version,
    }),
  );
}

export async function POST(request: Request) {
  return designRequestApi(request, "customer", async (db, actor) => {
    const acceptance = await acceptFinishedDesignsTerms(db, actor, await request.json());
    return NextResponse.json({ acceptance }, { status: 201 });
  });
}
