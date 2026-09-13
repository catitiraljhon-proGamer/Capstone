import {
  createGoogleFlow,
  getGoogleConfig,
  googleCookieOptions,
  googleFlowCookieName,
  googleLinkCookieName,
  GoogleAuthError,
} from "@/lib/server/google-oauth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const mode =
    request.nextUrl.searchParams.get("mode") === "register"
      ? "register"
      : "login";
  try {
    const config = getGoogleConfig();
    // Start on the configured origin so the callback receives the same browser cookie.
    // NextURL normalizes loopback aliases; forwarded headers also support HTTPS proxies.
    const host =
      request.headers.get("x-forwarded-host")?.split(",")[0].trim() ??
      request.headers.get("host") ??
      request.nextUrl.host;
    const protocol =
      request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
      request.nextUrl.protocol.replace(":", "");
    if (`${protocol}://${host}` !== config.origin) {
      const start = new URL("/api/auth/google", config.origin);
      start.search = request.nextUrl.search;
      return NextResponse.redirect(start, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const { url, cookie } = await createGoogleFlow(
      mode,
      request.nextUrl.searchParams.get("rememberMe") === "true",
    );
    const response = NextResponse.redirect(url, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
    response.cookies.set(googleFlowCookieName, cookie, googleCookieOptions);
    response.cookies.set(googleLinkCookieName, "", {
      ...googleCookieOptions,
      maxAge: 0,
    });
    return response;
  } catch (error) {
    const url = new URL(`/${mode}`, request.url);
    url.searchParams.set(
      "google_error",
      error instanceof GoogleAuthError ? error.code : "not_configured",
    );
    return NextResponse.redirect(url, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
