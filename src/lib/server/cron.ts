/**
 * Daily jobs are called by Vercel Cron (see vercel.json). With CRON_SECRET set, Vercel sends it as a bearer token and
 * any other caller is refused. Without it, only Vercel's cron agent is accepted; every job is safe to repeat.
 */
export function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return request.headers.get("authorization") === `Bearer ${secret}`;
  return (request.headers.get("user-agent") ?? "").startsWith("vercel-cron/");
}
