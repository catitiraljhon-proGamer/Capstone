import {
  collections,
  type ExteriorItemDocument,
  type HouseTypeDocument,
  type ReferenceValueDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = await getDatabase();
    const [finishDocuments, houseTypeDocuments, exteriorItemDocuments] =
      await Promise.all([
        db
          .collection<ReferenceValueDocument>(collections.referenceValues)
          .find({ category: "house-design-finish", active: true })
          .sort({ order: 1 })
          .toArray(),
        db
          .collection<HouseTypeDocument>(collections.houseTypes)
          .find({ active: true })
          .sort({ order: 1 })
          .toArray(),
        db
          .collection<ExteriorItemDocument>(collections.exteriorItems)
          .find({ active: true })
          .sort({ order: 1 })
          .toArray(),
      ]);

    return NextResponse.json({
      finishes: finishDocuments.map((item) => item.value),
      houseTypes: houseTypeDocuments.map(({ heading, description, imgSrc }) => ({
        heading,
        description,
        imgSrc,
      })),
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
