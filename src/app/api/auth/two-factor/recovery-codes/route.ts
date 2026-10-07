import { collections, type UserDocument } from "@/lib/database/collections";
import { apiError, unauthorized } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { generateRecoveryCodes } from "@/lib/server/two-factor";
import {
  checkTwoFactorCode,
  requireAccountUser,
  twoFactorCodeSchema,
} from "@/lib/server/two-factor-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Replaces every recovery code; the old ones stop working immediately. */
export async function POST(request: Request) {
  try {
    const account = await requireAccountUser();
    if (!account) return unauthorized();
    const { db, user, session } = account;
    const { code } = twoFactorCodeSchema.parse(await request.json());
    if (!user.twoFactor) {
      return NextResponse.json(
        { error: "Turn on two-factor authentication first." },
        { status: 409 },
      );
    }

    const check = await checkTwoFactorCode(db, user, code);
    if (check.error) return check.error;

    const { codes, stored } = generateRecoveryCodes();
    await db.collection<UserDocument>(collections.users).updateOne(
      { _id: user._id, twoFactor: { $exists: true } },
      { $set: { "twoFactor.recoveryCodes": stored, updatedAt: new Date() } },
    );
    await recordAuditLog({
      db,
      actor: session,
      action: "auth.recovery-codes-regenerated",
      entityType: "user",
      entityId: user._id,
    });
    return NextResponse.json(
      { recoveryCodes: codes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
