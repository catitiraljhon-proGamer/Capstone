import {
  collections,
  type AuditLogDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { readSession } from "@/lib/server/session";
import { toManagedUserDto, updateManagedUserSchema } from "@/lib/server/users";
import { hash } from "bcryptjs";
import { ObjectId, type UpdateFilter } from "mongodb";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const { id } = await context.params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
    }

    const input = updateManagedUserSchema.parse(await request.json());
    const db = await getDatabase();
    const users = db.collection<UserDocument>(collections.users);
    const userId = new ObjectId(id);
    const existing = await users.findOne({ _id: userId });

    if (!existing) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }

    const isCurrentUser = id === session.id;
    const changesOwnAccess =
      (input.role !== undefined && input.role !== existing.role) ||
      (input.status !== undefined && input.status !== existing.status);

    if (isCurrentUser && changesOwnAccess) {
      return NextResponse.json(
        { error: "You cannot change the role or status of your own account." },
        { status: 400 },
      );
    }

    if (isCurrentUser && input.password !== undefined) {
      return NextResponse.json(
        { error: "You cannot reset your own password from Users & Roles." },
        { status: 400 },
      );
    }

    const nextRole = input.role ?? existing.role;
    const nextStatus = input.status ?? existing.status;
    const removesActiveAdmin =
      existing.role === "admin" &&
      existing.status === "active" &&
      (nextRole !== "admin" || nextStatus !== "active");

    if (removesActiveAdmin) {
      const activeAdminCount = await users.countDocuments({
        role: "admin",
        status: "active",
      });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { error: "At least one active administrator account is required." },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const set: Partial<UserDocument> = { updatedAt: now };
    if (input.name !== undefined) set.name = input.name;
    if (input.email !== undefined) set.email = input.email;
    if (input.role !== undefined) set.role = input.role;
    if (input.status !== undefined) set.status = input.status;
    if (input.password !== undefined) {
      set.passwordHash = await hash(input.password, 12);
    }

    const invalidatesSessions =
      input.password !== undefined ||
      nextRole !== existing.role ||
      nextStatus !== existing.status;
    const update: UpdateFilter<UserDocument> = invalidatesSessions
      ? { $set: set, $inc: { authVersion: 1 } }
      : { $set: set };
    const updated = await users.findOneAndUpdate(
      { _id: userId },
      update,
      { returnDocument: "after" },
    );

    if (!updated) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }

    const details: NonNullable<AuditLogDocument["details"]> = {
      name: updated.name,
      email: updated.email,
    };
    if (nextRole !== existing.role) {
      details.role = `${existing.role} -> ${nextRole}`;
    }
    if (nextStatus !== existing.status) {
      details.status = `${existing.status} -> ${nextStatus}`;
    }
    if (input.password !== undefined) details.passwordReset = true;

    await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
      _id: new ObjectId(),
      actorId: new ObjectId(session.id),
      actorName: session.name,
      actorRole: session.role,
      action: "user.updated",
      entityType: "user",
      entityId: updated._id,
      details,
      createdAt: now,
    });

    return NextResponse.json({ user: toManagedUserDto(updated) });
  } catch (error) {
    return apiError(error);
  }
}
