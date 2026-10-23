import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { listHouseTypes } from "@/lib/server/house-designs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const houseTypes = await listHouseTypes(await getDatabase());
    return NextResponse.json({ houseTypes });
  } catch (error) {
    return apiError(error);
  }
}
