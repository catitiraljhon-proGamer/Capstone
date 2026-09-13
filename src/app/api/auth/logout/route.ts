import { getDatabase } from "@/lib/database/mongodb";
import { recordAuditLog } from "@/lib/server/audit";
import { readSession, sessionCookieName } from "@/lib/server/session";
import { NextResponse } from "next/server";

export async function DELETE() {
  const session = await readSession();
  if (session) {
    try {
      const db = await getDatabase();
      await recordAuditLog({
        db,
        actor: session,
        action: "auth.logout",
        entityType: "session",
      });
    } catch (error) {
      // Clearing the session remains more important than audit availability.
      console.error("Unable to record logout audit event.", error);
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
