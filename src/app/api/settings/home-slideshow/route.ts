import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { getHomeSlides } from "@/lib/server/home-slideshow";
import { NextResponse } from "next/server";

/** Public: the home page slideshow, one cover photo per design. */
export async function GET() {
  try {
    return NextResponse.json({ slides: await getHomeSlides(await getDatabase()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
