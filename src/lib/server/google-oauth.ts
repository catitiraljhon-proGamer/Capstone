import { getAuthSecret } from "@/lib/server/auth-secret";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { z } from "zod";

export const googleFlowCookieName = "g4_google_flow";
export const googleLinkCookieName = "g4_google_link";
export const googleCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 600,
};

const flowSchema = z.object({
  state: z.string().min(32),
  nonce: z.string().min(32),
  verifier: z.string().min(43).max(128),
  mode: z.enum(["login", "register"]),
  rememberMe: z.boolean(),
});
const linkSchema = z.object({
  userId: z.string().regex(/^[a-f0-9]{24}$/),
  googleSub: z.string().min(1).max(255),
  email: z.email(),
  authVersion: z.number().int().nonnegative(),
  rememberMe: z.boolean(),
});
export type GoogleFlow = z.infer<typeof flowSchema>;
export type GoogleLink = z.infer<typeof linkSchema>;
export type GoogleProfile = { sub: string; email: string; name: string };

export class GoogleAuthError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new GoogleAuthError("not_configured");
  }
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new GoogleAuthError("not_configured");
  }
  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/api/auth/google/callback" ||
    url.search ||
    url.hash
  ) {
    throw new GoogleAuthError("not_configured");
  }
  getAuthSecret();
  return { clientId, clientSecret, redirectUri, origin: url.origin };
}

async function signTemporaryToken(
  payload: GoogleFlow | GoogleLink,
  audience: string,
) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("g4-builders")
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getAuthSecret());
}

async function verifyTemporaryToken(
  token: string | undefined,
  audience: string,
) {
  if (!token) throw new GoogleAuthError("expired");
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      algorithms: ["HS256"],
      issuer: "g4-builders",
      audience,
      requiredClaims: ["iat", "exp"],
      maxTokenAge: "10m",
    });
    return payload;
  } catch {
    throw new GoogleAuthError("expired");
  }
}

export async function createGoogleFlow(
  mode: GoogleFlow["mode"],
  rememberMe: boolean,
) {
  const config = getGoogleConfig();
  const flow: GoogleFlow = {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    mode,
    rememberMe,
  };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256")
      .update(flow.verifier)
      .digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url, cookie: await signTemporaryToken(flow, "google-flow") };
}

export async function readGoogleFlow(
  token: string | undefined,
  state: string | null,
) {
  const flow = flowSchema.parse(
    await verifyTemporaryToken(token, "google-flow"),
  );
  const expected = Buffer.from(flow.state);
  const received = Buffer.from(state ?? "");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new GoogleAuthError("expired");
  }
  return flow;
}

export function createGoogleLink(link: GoogleLink) {
  return signTemporaryToken(linkSchema.parse(link), "google-link");
}

export async function readGoogleLink(
  token: string | undefined,
): Promise<GoogleLink | null> {
  try {
    return linkSchema.parse(await verifyTemporaryToken(token, "google-link"));
  } catch {
    return null;
  }
}

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export async function verifyGoogleIdToken(
  idToken: string,
  nonce: string,
  clientId: string,
  keys: Parameters<typeof jwtVerify>[1] = googleKeys,
): Promise<GoogleProfile> {
  const { payload } = await jwtVerify(idToken, keys, {
    algorithms: ["RS256"],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    requiredClaims: ["sub", "exp", "iat", "nonce", "email", "email_verified"],
  });
  if (
    payload.nonce !== nonce ||
    (payload.azp !== undefined && payload.azp !== clientId)
  ) {
    throw new GoogleAuthError("failed");
  }
  if (payload.email_verified !== true)
    throw new GoogleAuthError("unverified_email");
  const sub = z.string().min(1).max(255).parse(payload.sub);
  const email = z.email().parse(payload.email).trim().toLowerCase();
  const name =
    typeof payload.name === "string" ? payload.name.trim().slice(0, 100) : "";
  return { sub, email, name: name || email.split("@")[0] };
}

export async function exchangeGoogleCode(code: string, flow: GoogleFlow) {
  const config = getGoogleConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: flow.verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new GoogleAuthError("failed");
  const data: unknown = await response.json();
  const { id_token: idToken } = z
    .object({ id_token: z.string().min(1) })
    .parse(data);
  return verifyGoogleIdToken(idToken, flow.nonce, config.clientId);
}
