import { apiError, unauthorized } from "@/lib/server/api";
import { syncSessionTwoFactor } from "@/lib/server/session";
import { remainingRecoveryCodes } from "@/lib/server/two-factor";
import { requireAccountUser } from "@/lib/server/two-factor-api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const account = await requireAccountUser();
    if (!account) return unauthorized();
    const { user } = account;
    const response = NextResponse.json(
      {
        enabled: Boolean(user.twoFactor),
        enabledAt: user.twoFactor?.enabledAt.toISOString() ?? null,
        recoveryCodesRemaining: remainingRecoveryCodes(user),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    // Sessions signed before 2FA became required carry no 2FA claim yet.
    await syncSessionTwoFactor(response, user);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
