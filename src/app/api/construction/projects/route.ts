import { NextResponse } from "next/server";
import { listProjects } from "@/lib/server/construction";
import { designRequestApi } from "@/lib/server/design-request-api";

export async function GET(request: Request) {
  return designRequestApi(request, ["customer", "admin", "billing-clerk"], async (db, actor) => NextResponse.json({ projects: await listProjects(db, actor) }));
}
