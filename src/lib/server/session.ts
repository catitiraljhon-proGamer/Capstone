import { collections, type UserDocument } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { getAuthSecret } from "@/lib/server/auth-secret";
import type { UserRole, SessionUser } from "@/types/domain";
import { jwtVerify, SignJWT } from "jose";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const sessionCookieName = "g4_session";

export async function createSessionToken(
  user: SessionUser & { authVersion: number; twoFactor: boolean },
  expiresIn: string,
) {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    authVersion: user.authVersion,
    twoFactor: user.twoFactor,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getAuthSecret());
}

export function toSessionUser(user: UserDocument): SessionUser {
  return {
    id: user._id.toHexString(),
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

async function setSessionCookie(
  response: NextResponse,
  user: UserDocument,
  maxAge: number,
) {
  const sessionUser = toSessionUser(user);
  const token = await createSessionToken(
    {
      ...sessionUser,
      authVersion: user.authVersion ?? 0,
      twoFactor: Boolean(user.twoFactor),
    },
    `${maxAge}s`,
  );
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return sessionUser;
}

/** Signs a session for a fully authenticated user and sets its cookie. */
export async function startSession(
  response: NextResponse,
  user: UserDocument,
  rememberMe: boolean,
) {
  return setSessionCookie(
    response,
    user,
    rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8,
  );
}

async function readSessionPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return payload;
  } catch {
    return null;
  }
}

/**
 * Re-signs the current session when its 2FA claim no longer matches the
 * account, so the proxy sees the change without a new sign-in. The original
 * expiry is kept.
 */
export async function syncSessionTwoFactor(response: NextResponse, user: UserDocument) {
  const payload = await readSessionPayload();
  if (!payload || payload.twoFactor === Boolean(user.twoFactor)) return;
  const maxAge = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
  if (maxAge > 0) await setSessionCookie(response, user, maxAge);
}

type ReadSessionOptions = {
  /** Lets accounts without 2FA through; only for signing out and setting up 2FA. */
  allowWithoutTwoFactor?: boolean;
};

export async function readSession(
  options: ReadSessionOptions = {},
): Promise<SessionUser | null> {
  const payload = await readSessionPayload();

  if (!payload) {
    return null;
  }

  try {
    const role = payload.role as UserRole | undefined;

    if (
      !payload.sub ||
      !ObjectId.isValid(payload.sub) ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      !role ||
      !["customer", "billing-clerk", "admin"].includes(role)
    ) {
      return null;
    }

    const tokenAuthVersion =
      typeof payload.authVersion === "number" ? payload.authVersion : 0;
    const db = await getDatabase();
    const user = await db.collection<UserDocument>(collections.users).findOne(
      { _id: new ObjectId(payload.sub), status: "active" },
      {
        projection: {
          email: 1,
          name: 1,
          role: 1,
          authVersion: 1,
          "twoFactor.enabledAt": 1,
        },
      },
    );

    if (
      !user ||
      user.role !== role ||
      (user.authVersion ?? 0) !== tokenAuthVersion ||
      (!user.twoFactor && !options.allowWithoutTwoFactor)
    ) {
      return null;
    }

    return {
      id: payload.sub,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  } catch {
    return null;
  }
}

export async function requireSession(
  roles?: UserRole[],
  options?: ReadSessionOptions,
) {
  const session = await readSession(options);

  if (!session || (roles && !roles.includes(session.role))) {
    return null;
  }

  return session;
}
