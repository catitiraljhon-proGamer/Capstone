import {
  collections,
  type NotificationDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { createClientSchema } from "@/lib/server/clients";
import {
  clientIp,
  formatRetryAfter,
  getRateLimitStatus,
  rateLimitKeys,
  rateLimitPolicies,
  recordRateLimitFailure,
} from "@/lib/server/rate-limit";
import { startSession, toSessionUser } from "@/lib/server/session";
import { roleHomePaths } from "@/types/domain";
import { hash } from "bcryptjs";
import { MongoServerError, ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

const registrationSchema = createClientSchema.extend({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(100, "Your name must be 100 characters or fewer."),
  password: z
    .string()
    .min(8, "Your password must contain at least 8 characters.")
    .max(72, "Your password must contain 72 characters or fewer."),
});

export async function POST(request: Request) {
  try {
    const { name, email, password, ...clientDetails } = registrationSchema.parse(await request.json());
    const db = await getDatabase();
    // Every attempt from a network address counts, which limits both
    // automated sign-ups and probing which emails already have accounts.
    const ipKey = rateLimitKeys.register(clientIp(request));
    const limit = await getRateLimitStatus(db, ipKey, rateLimitPolicies.register);
    if (limit.locked) {
      return NextResponse.json(
        {
          error: `Too many registration attempts from this network. Try again in ${formatRetryAfter(limit.retryAfterSeconds)}.`,
        },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    await recordRateLimitFailure(db, ipKey, rateLimitPolicies.register);
    const users = db.collection<UserDocument>(collections.users);
    const existingUser = await users.findOne(
      { email },
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
      name,
      email,
      passwordHash: await hash(password, 12),
      clientDetails,
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
            href: "/admin/clients",
            kind: "account",
            entityId: user._id,
            createdAt: now,
          })),
        );
    }

    const sessionUser = toSessionUser(user);
    const response = NextResponse.json(
      { user: sessionUser, redirectTo: roleHomePaths.customer },
      { status: 201 },
    );
    await startSession(response, user, false);
    await recordAuditLog({
      db,
      actor: sessionUser,
      action: "auth.registered",
      entityType: "user",
      entityId: userId,
      details: { email: user.email, role: user.role },
      createdAt: now,
    });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
