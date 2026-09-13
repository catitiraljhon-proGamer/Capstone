import {
  collections,
  type AuditLogDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { readSession } from "@/lib/server/session";
import { createManagedUserSchema, toManagedUserDto } from "@/lib/server/users";
import { hash } from "bcryptjs";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const db = await getDatabase();
    const users = db.collection<UserDocument>(collections.users);
    const [documents, total, active, customers, staff, disabled] =
      await Promise.all([
        users.find().sort({ createdAt: -1, name: 1 }).limit(1000).toArray(),
        users.countDocuments(),
        users.countDocuments({ status: "active" }),
        users.countDocuments({ role: "customer" }),
        users.countDocuments({ role: { $in: ["billing-clerk", "admin"] } }),
        users.countDocuments({ status: "disabled" }),
      ]);

    return NextResponse.json({
      users: documents.map(toManagedUserDto),
      summary: { total, active, customers, staff, disabled },
      currentUserId: session.id,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const input = createManagedUserSchema.parse(await request.json());
    const db = await getDatabase();
    const now = new Date();
    const user: UserDocument = {
      _id: new ObjectId(),
      name: input.name,
      email: input.email,
      passwordHash: await hash(input.password, 12),
      role: input.role,
      status: input.status,
      authVersion: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection<UserDocument>(collections.users).insertOne(user);
    await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
      _id: new ObjectId(),
      actorId: new ObjectId(session.id),
      actorName: session.name,
      actorRole: session.role,
      action: "user.created",
      entityType: "user",
      entityId: user._id,
      details: {
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      createdAt: now,
    });

    return NextResponse.json({ user: toManagedUserDto(user) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
