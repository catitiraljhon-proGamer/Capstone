import { apiError, unauthorized } from "@/lib/server/api";
import { remainingRecoveryCodes } from "@/lib/server/two-factor";
import { requireAccountUser } from "@/lib/server/two-factor-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const account = await requireAccountUser();
    if (!account) return unauthorized();
    const { user } = account;
    return NextResponse.json(
      {
        enabled: Boolean(user.twoFactor),
        enabledAt: user.twoFactor?.enabledAt.toISOString() ?? null,
        recoveryCodesRemaining: remainingRecoveryCodes(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
