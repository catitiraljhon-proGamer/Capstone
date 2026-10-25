import { NextResponse } from "next/server";
import { z } from "zod";
import { designRequestApi } from "@/lib/server/design-request-api";
import { recordSiteInspection, scheduleSiteInspection } from "@/lib/server/site-inspections";

const actionSchema = z.object({ action: z.enum(["schedule", "record"], { error: "Choose to schedule or record the inspection." }) }).loose();

/** Admin only: { action: "schedule", ... } books or moves the visit; { action: "record", ... } saves the result. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return designRequestApi(request, "admin", async (db, actor) => {
    const { id } = await context.params;
    const { action, ...input } = actionSchema.parse(await request.json());
    const siteInspection = action === "schedule"
      ? await scheduleSiteInspection(db, actor, id, input)
      : await recordSiteInspection(db, actor, id, input);
    return NextResponse.json({ siteInspection });
  });
}
