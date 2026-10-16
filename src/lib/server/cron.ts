import { timingSafeEqual } from "node:crypto";

/**
 * Daily jobs are called by Vercel Cron (see vercel.json), which sends CRON_SECRET as a bearer token. Any other caller
 * is refused, and without CRON_SECRET set the jobs do not run at all.
 */
export function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
