import {
  collections,
  type ExteriorItemDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { listHouseTypes } from "@/lib/server/house-designs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = await getDatabase();
    const [houseTypes, exteriorItemDocuments] = await Promise.all([
      listHouseTypes(db),
      db
        .collection<ExteriorItemDocument>(collections.exteriorItems)
        .find({ active: true })
        .sort({ order: 1 })
        .toArray(),
    ]);

    return NextResponse.json({
      houseTypes,
      exteriorItems: exteriorItemDocuments.map(
        ({ item, detail, quantity, quantityByArea, options }) => ({
          item,
          detail,
          quantity,
          quantityByArea,
          options,
        }),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
