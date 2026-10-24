import {
  collections,
  type AuditLogDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { accountTermsRecords, requireCurrentTerms } from "@/lib/server/account-terms";
import { recordAuditLog } from "@/lib/server/audit";
import { billingTransaction } from "@/lib/server/billing";
import { signInDestination, toClientDetails } from "@/lib/server/clients";
import {
  checkEmailVerificationCode,
  EmailVerificationError,
  registrationDetailsSchema,
} from "@/lib/server/email-verification";
import { requirePasswordPolicy } from "@/lib/server/maintenance";
import { insertNotifications } from "@/lib/server/notifications";
import {
  clientIp,
  formatRetryAfter,
  getRateLimitStatus,
  rateLimitKeys,
  rateLimitPolicies,
  recordRateLimitFailure,
} from "@/lib/server/rate-limit";
import { startSession, toSessionUser } from "@/lib/server/session";
import { hash } from "bcryptjs";
import { MongoServerError, ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

const registrationSchema = registrationDetailsSchema.extend({
  verificationCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code sent to your email."),
});

export async function POST(request: Request) {
  try {
    const { name, email, password, verificationCode, termsVersion, ...input } = registrationSchema.parse(await request.json());
    const clientDetails = toClientDetails(input);
    const db = await getDatabase();
    const currentTerms = await requireCurrentTerms(db, termsVersion);
    await requirePasswordPolicy(db, password);
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

    // Proves the registrant can read this inbox, so made-up addresses cannot register.
    await checkEmailVerificationCode(db, email, verificationCode);

    const now = new Date();
    const userId = new ObjectId();
    // The Terms and Conditions agreement is saved with the account, so an account never exists without it.
    const terms = accountTermsRecords({ id: userId.toHexString(), name, role: "customer" }, currentTerms, now);
    const user: UserDocument = {
      _id: userId,
      name,
      email,
      passwordHash: await hash(password, 12),
      clientDetails,
      role: "customer",
      status: "active",
      authVersion: 0,
      termsAcceptance: terms.acceptance,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await billingTransaction(db, async (session) => {
        await users.insertOne(user, { session });
        await db.collection<AuditLogDocument>(collections.auditLogs).insertOne(terms.auditLog, { session });
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return NextResponse.json(
          { error: "An account with this email address already exists." },
          { status: 409 },
        );
      }
      throw error;
    }
    // The used code is left to expire: the account now exists, so it cannot register
    // again, and a simultaneous duplicate submission still gets the 409 above.

    const admins = await users
      .find(
        { role: "admin", status: "active" },
        { projection: { _id: 1 } },
      )
      .toArray();
    await insertNotifications(
      db,
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

    const sessionUser = toSessionUser(user);
    const response = NextResponse.json(
      { user: sessionUser, redirectTo: signInDestination(user) },
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
    if (error instanceof EmailVerificationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiError(error);
  }
}
