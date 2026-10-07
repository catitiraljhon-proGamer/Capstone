import { collections, type UserDocument } from "@/lib/database/collections";
import { apiError, unauthorized } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import {
  checkTwoFactorCode,
  requireAccountUser,
  twoFactorCodeSchema,
} from "@/lib/server/two-factor-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Turning 2FA off requires a current code, not just a signed-in session. */
export async function POST(request: Request) {
  try {
    const account = await requireAccountUser();
    if (!account) return unauthorized();
    const { db, user, session } = account;
    const { code } = twoFactorCodeSchema.parse(await request.json());
    if (!user.twoFactor) {
      return NextResponse.json(
        { error: "Two-factor authentication is already off." },
        { status: 409 },
      );
    }

    const check = await checkTwoFactorCode(db, user, code);
    if (check.error) return check.error;

    await db.collection<UserDocument>(collections.users).updateOne(
      { _id: user._id },
      {
        $unset: { twoFactor: "", twoFactorSetup: "" },
        $set: { updatedAt: new Date() },
      },
    );
    await recordAuditLog({
      db,
      actor: session,
      action: "auth.two-factor-disabled",
      entityType: "user",
      entityId: user._id,
      details: { confirmedWith: check.method },
    });
    return NextResponse.json({ enabled: false });
  } catch (error) {
    return apiError(error);
  }
}
