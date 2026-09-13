import { collections } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = await getDatabase();
    const [activeProjects, publishedDesigns, completedProjects] = await Promise.all([
      db.collection(collections.projects).countDocuments({ status: "Active" }),
      db.collection(collections.houseDesigns).countDocuments({ status: "Published" }),
      db.collection(collections.projects).countDocuments({ status: "Completed" }),
    ]);

    return NextResponse.json({ activeProjects, publishedDesigns, completedProjects });
  } catch (error) {
    return apiError(error);
  }
}
