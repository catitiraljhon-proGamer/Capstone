import { collections, type UserDocument } from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { getAuthSecret } from "@/lib/server/auth-secret";
import type { UserRole, SessionUser } from "@/types/domain";
import { jwtVerify, SignJWT } from "jose";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";

export const sessionCookieName = "g4_session";

export async function createSessionToken(
  user: SessionUser & { authVersion: number },
  expiresIn: string,
) {
  return new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    authVersion: user.authVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getAuthSecret());
}

export async function readSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
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
      { projection: { email: 1, name: 1, role: 1, authVersion: 1 } },
    );

    if (
      !user ||
      user.role !== role ||
      (user.authVersion ?? 0) !== tokenAuthVersion
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

export async function requireSession(roles?: UserRole[]) {
  const session = await readSession();

  if (!session || (roles && !roles.includes(session.role))) {
    return null;
  }

  return session;
}
