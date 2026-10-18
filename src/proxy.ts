import { getDatabase } from "@/lib/database/mongodb";
import { maintenanceNotice } from "@/lib/maintenance-mode";
import { readMaintenanceMode } from "@/lib/server/maintenance-mode";
import { roleHomePaths, type UserRole } from "@/types/domain";
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const sessionCookieName = "g4_session";

/** Roles locked out while maintenance mode is on; the Admin keeps full access. */
const pausedRoles = new Set<UserRole>(["customer", "billing-clerk"]);
/** Signing in or out, reading the maintenance status, the public settings, and Contact Us keep working during maintenance. */
const openApiPrefixes = ["/api/auth/", "/api/maintenance/mode", "/api/settings/public", "/api/settings/contact"];

function requiredRole(pathname: string): UserRole | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/billing-clerk")) return "billing-clerk";
  if (pathname.startsWith("/customer")) return "customer";
  return null;
}

async function sessionRole(request: NextRequest, secret: string | undefined) {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token || !secret || secret.length < 32) return null;
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
  return (payload.role as UserRole | undefined) ?? null;
}

/** The end time when this role is locked out right now. A database problem never locks anyone out. */
async function pausedUntil(role: UserRole | null) {
  if (!role || !pausedRoles.has(role)) return null;
  try {
    const status = await readMaintenanceMode(await getDatabase());
    return status.active ? status.endsAt : null;
  } catch (error) {
    console.error("Maintenance mode check failed", error);
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.AUTH_SECRET;

  if (pathname.startsWith("/api/")) {
    if (openApiPrefixes.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();
    const role = await sessionRole(request, secret).catch(() => null);
    const endsAt = await pausedUntil(role);
    return endsAt
      ? NextResponse.json({ error: maintenanceNotice(endsAt), maintenance: { endsAt } }, { status: 503, headers: { "Retry-After": "300" } })
      : NextResponse.next();
  }

  const role = requiredRole(pathname);
  if (!role) return NextResponse.next();

  try {
    const currentRole = await sessionRole(request, secret);
    if (!currentRole) return NextResponse.redirect(new URL("/login", request.url));

    if (currentRole !== role) {
      return NextResponse.redirect(new URL(roleHomePaths[currentRole], request.url));
    }

    // Keep the address the person opened so a reload after maintenance lands back on it.
    if (await pausedUntil(currentRole)) return NextResponse.rewrite(new URL("/maintenance", request.url));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/admin/:path*", "/billing-clerk/:path*", "/customer/:path*", "/api/:path*"],
};
