import {
  collections,
  type ProjectDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { readSession } from "@/lib/server/session";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const db = await getDatabase();
    const projects = await db
      .collection<ProjectDocument>(collections.projects)
      .find()
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    const customerIds = [...new Set(projects.map((project) => project.customerId.toHexString()))];
    const customers = customerIds.length
      ? await db
          .collection<UserDocument>(collections.users)
          .find({ _id: { $in: customerIds.map((id) => new ObjectId(id)) } })
          .toArray()
      : [];
    const customerNames = new Map(
      customers.map((customer) => [customer._id.toHexString(), customer.name]),
    );

    return NextResponse.json({
      projects: projects.map((project) => ({
        id: project._id.toHexString(),
        reference: project.reference,
        name: project.name,
        customer: customerNames.get(project.customerId.toHexString()) ?? "Unknown client",
        status: project.status,
        contractPrice: project.contractPrice,
        updatedAt: project.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
