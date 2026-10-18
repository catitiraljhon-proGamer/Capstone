import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { getContactDetails } from "@/lib/server/contact-details";
import { NextResponse } from "next/server";

/** Public: the Contact Us button on every page reads the office phone, email, and address. */
export async function GET() {
  try {
    return NextResponse.json(await getContactDetails(await getDatabase()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
