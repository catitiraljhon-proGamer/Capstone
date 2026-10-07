import { collections, type UserDocument } from "@/lib/database/collections";
import { apiError, unauthorized } from "@/lib/server/api";
import { generateTotpSecret, totpUri } from "@/lib/server/totp";
import { encryptTwoFactorSecret, twoFactorIssuer } from "@/lib/server/two-factor";
import { requireAccountUser } from "@/lib/server/two-factor-api";
import { NextResponse } from "next/server";
import QRCode from "qrcode";

export const runtime = "nodejs";

/** Starts authenticator enrollment; nothing changes until a code is confirmed. */
export async function POST() {
  try {
    const account = await requireAccountUser();
    if (!account) return unauthorized();
    const { db, user } = account;
    if (user.twoFactor) {
      return NextResponse.json(
        { error: "Two-factor authentication is already on." },
        { status: 409 },
      );
    }

    const secret = generateTotpSecret();
    await db.collection<UserDocument>(collections.users).updateOne(
      { _id: user._id },
      {
        $set: {
          twoFactorSetup: {
            secret: encryptTwoFactorSecret(secret),
            createdAt: new Date(),
          },
        },
      },
    );
    const uri = totpUri({ secret, accountName: user.email, issuer: twoFactorIssuer });
    return NextResponse.json(
      {
        qrCode: await QRCode.toDataURL(uri, { margin: 1, width: 220 }),
        secret: secret.match(/.{1,4}/g)?.join(" ") ?? secret,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
