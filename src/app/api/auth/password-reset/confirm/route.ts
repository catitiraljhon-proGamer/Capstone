import { collections, type UserDocument } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { requirePasswordPolicy } from "@/lib/server/maintenance";
import {
  passwordResetConfirmSchema,
  readPasswordResetToken,
  resetTokenMatches,
} from "@/lib/server/password-reset";
import { clearRateLimit, rateLimitKeys } from "@/lib/server/rate-limit";
import { toSessionUser } from "@/lib/server/session";
import { hash } from "bcryptjs";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function expiredLink() {
  return NextResponse.json(
    { error: "This reset link has expired or was already used. Request a new one.", expired: true },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  try {
    const { token, password } = passwordResetConfirmSchema.parse(await request.json());
    const claims = await readPasswordResetToken(token);
    if (!claims || !ObjectId.isValid(claims.userId)) return expiredLink();

    const db = await getDatabase();
    const users = db.collection<UserDocument>(collections.users);
    const user = await users.findOne({ _id: new ObjectId(claims.userId), status: "active" });
    if (!user || !resetTokenMatches(user, claims.fingerprint)) return expiredLink();

    await requirePasswordPolicy(db, password);

    // Matching the old hash makes the link single-use even if it is submitted twice at once.
    // Raising authVersion signs out every session on the account.
    const result = await users.updateOne(
      { _id: user._id, passwordHash: user.passwordHash },
      {
        $set: { passwordHash: await hash(password, 12), updatedAt: new Date() },
        $inc: { authVersion: 1 },
      },
    );
    if (result.modifiedCount === 0) return expiredLink();

    await clearRateLimit(db, rateLimitKeys.loginAccount(user.email));
    await recordAuditLog({
      db,
      actor: toSessionUser(user),
      action: "auth.password-reset",
      entityType: "session",
    });

    return NextResponse.json({ reset: true });
  } catch (error) {
    return apiError(error);
  }
}
