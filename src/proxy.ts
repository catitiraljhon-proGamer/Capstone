import { roleHomePaths, type UserRole } from "@/types/domain";
import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const sessionCookieName = "g4_session";

function requiredRole(pathname: string): UserRole | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/billing-clerk")) return "billing-clerk";
  if (pathname.startsWith("/customer")) return "customer";
  return null;
}

export async function proxy(request: NextRequest) {
  const role = requiredRole(request.nextUrl.pathname);
  if (!role) return NextResponse.next();

  const token = request.cookies.get(sessionCookieName)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret || secret.length < 32) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const sessionRole = payload.role as UserRole | undefined;

    if (sessionRole !== role) {
      return NextResponse.redirect(
        new URL(sessionRole ? roleHomePaths[sessionRole] : "/login", request.url),
      );
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/admin/:path*", "/billing-clerk/:path*", "/customer/:path*"],
};
