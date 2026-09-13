import {
  collections,
  type NotificationDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { createSessionToken, sessionCookieName } from "@/lib/server/session";
import { roleHomePaths, type SessionUser } from "@/types/domain";
import { hash } from "bcryptjs";
import { MongoServerError, ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

const registrationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(100, "Your name must be 100 characters or fewer."),
  email: z.email().trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Your password must contain at least 8 characters.")
    .max(72, "Your password must contain 72 characters or fewer."),
});

export async function POST(request: Request) {
  try {
    const input = registrationSchema.parse(await request.json());
    const db = await getDatabase();
    const users = db.collection<UserDocument>(collections.users);
    const existingUser = await users.findOne(
      { email: input.email },
      { projection: { _id: 1 } },
    );

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email address already exists." },
        { status: 409 },
      );
    }

    const now = new Date();
    const userId = new ObjectId();
    const user: UserDocument = {
      _id: userId,
      name: input.name,
      email: input.email,
      passwordHash: await hash(input.password, 12),
      role: "customer",
      status: "active",
      authVersion: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await users.insertOne(user);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return NextResponse.json(
          { error: "An account with this email address already exists." },
          { status: 409 },
        );
      }
      throw error;
    }

    const admins = await users
      .find(
        { role: "admin", status: "active" },
        { projection: { _id: 1 } },
      )
      .toArray();
    if (admins.length > 0) {
      await db
        .collection<NotificationDocument>(collections.notifications)
        .insertMany(
          admins.map((admin) => ({
            _id: new ObjectId(),
            userId: admin._id,
            title: "New customer account",
            body: `${user.name} registered a customer account.`,
            href: "/admin/users-roles",
            kind: "account",
            entityId: user._id,
            createdAt: now,
          })),
        );
    }

    const sessionUser: SessionUser = {
      id: userId.toHexString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const maxAge = 60 * 60 * 8;
    const token = await createSessionToken(
      { ...sessionUser, authVersion: user.authVersion ?? 0 },
      `${maxAge}s`,
    );
    await recordAuditLog({
      db,
      actor: sessionUser,
      action: "auth.registered",
      entityType: "user",
      entityId: userId,
      details: { email: user.email, role: user.role },
      createdAt: now,
    });
    const response = NextResponse.json(
      {
        user: sessionUser,
        redirectTo: roleHomePaths.customer,
      },
      { status: 201 },
    );

    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });

    return response;
  } catch (error) {
    return apiError(error);
  }
}
