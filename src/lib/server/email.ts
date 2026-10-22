import nodemailer, { type Transporter } from "nodemailer";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not configured.");
  }
}

type GmailConfig = { user: string; appPassword: string; fromName: string };

/** Gmail SMTP with an App Password (Google Account > Security > App passwords). */
export function getGmailConfig(): GmailConfig | null {
  const user = process.env.GMAIL_USER?.trim();
  // Google shows App Passwords in groups of four; the spaces are not part of it.
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !appPassword) return null;
  return {
    user,
    appPassword,
    fromName: process.env.EMAIL_FROM_NAME?.trim() || "G4 Builders Inc",
  };
}

export function isEmailConfigured() {
  return getGmailConfig() !== null;
}

/** Absolute site address for links inside emails. */
export function appUrl(path = "/") {
  const configured =
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return new URL(path, configured).toString();
}

const globalForEmail = globalThis as typeof globalThis & {
  gmailTransporter?: { key: string; transporter: Transporter };
};

function transporterFor(config: GmailConfig) {
  const key = `${config.user}:${config.appPassword}`;
  if (globalForEmail.gmailTransporter?.key !== key) {
    globalForEmail.gmailTransporter = {
      key,
      transporter: nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: config.user, pass: config.appPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      }),
    };
  }
  return globalForEmail.gmailTransporter.transporter;
}

export type EmailMessage = { to: string; subject: string; text: string; html: string };

export async function sendEmail(message: EmailMessage) {
  const config = getGmailConfig();
  if (!config) throw new EmailNotConfiguredError();
  await transporterFor(config).sendMail({
    from: { name: config.fromName, address: config.user },
    ...message,
  });
}

/** Safe log fields for a failed send: Nodemailer's fixed code (e.g. EAUTH) and SMTP status, never the message. */
export function emailErrorDetails(error: unknown) {
  const details = error as { code?: unknown; responseCode?: unknown };
  return {
    errorType: error instanceof Error ? error.name : "UnknownError",
    code: typeof details?.code === "string" ? details.code.slice(0, 32) : undefined,
    responseCode: typeof details?.responseCode === "number" ? details.responseCode : undefined,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Plain branded layout that renders in Gmail and other clients without external assets. */
function layout(heading: string, content: string) {
  return `<!doctype html>
<html><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#0c0a09">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e7e5e4;font-size:14px;font-weight:bold;color:#b91c1c;letter-spacing:0.5px">G4 BUILDERS INC</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:28px">${escapeHtml(heading)}</h1>
${content}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#78716c">This is an automated message from G4 Builders Inc. Please do not reply.</p>
</td></tr>
</table>
</body></html>`;
}

export function verificationCodeEmail(to: string, code: string, minutesValid: number): EmailMessage {
  return {
    to,
    subject: `${code} is your G4 Builders verification code`,
    text: `Your G4 Builders verification code is ${code}. It expires in ${minutesValid} minutes. If you did not try to create an account, you can ignore this email.`,
    html: layout(
      "Verify your email address",
      `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#57534e">Enter this code on the registration page to finish creating your client account.</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0c0a09">${code}</p>
<p style="margin:0;font-size:13px;line-height:20px;color:#78716c">The code expires in ${minutesValid} minutes. If you did not try to create an account, you can ignore this email.</p>`,
    ),
  };
}

function buttonLink(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px">${escapeHtml(label)}</a>`;
}

export function passwordResetEmail(
  to: string,
  recipientName: string,
  token: string,
  minutesValid: number,
): EmailMessage {
  const link = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  return {
    to,
    subject: "Reset your G4 Builders password",
    text: `Hi ${recipientName},\n\nWe received a request to reset your G4 Builders password. Open this link to set a new one:\n${link}\n\nThe link expires in ${minutesValid} minutes and works once. If you did not ask to reset your password, you can ignore this email.`,
    html: layout(
      "Reset your password",
      `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#57534e">Hi ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:22px;color:#57534e">We received a request to reset your G4 Builders password. Click the button below to set a new one.</p>
${buttonLink(link, "Reset Password")}
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#78716c">The link expires in ${minutesValid} minutes and works once. If you did not ask to reset your password, you can ignore this email.</p>`,
    ),
  };
}

/** Sent instead of a reset link when the account has no password and signs in with Google. */
export function googleSignInReminderEmail(to: string, recipientName: string): EmailMessage {
  const link = appUrl("/login");
  return {
    to,
    subject: "How to sign in to G4 Builders",
    text: `Hi ${recipientName},\n\nWe received a request to reset your G4 Builders password, but your account signs in with Google and has no password. Go to ${link} and choose "Sign in with Google".\n\nIf you did not make this request, you can ignore this email.`,
    html: layout(
      "Your account uses Google sign-in",
      `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#57534e">Hi ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:22px;color:#57534e">We received a request to reset your G4 Builders password, but your account signs in with Google and has no password to reset. Open the sign-in page and choose <strong>Sign in with Google</strong>.</p>
${buttonLink(link, "Go to Sign In")}
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#78716c">If you did not make this request, you can ignore this email.</p>`,
    ),
  };
}

export function notificationEmail(
  to: string,
  recipientName: string,
  notification: { title: string; body: string; href?: string },
): EmailMessage {
  const link = appUrl(notification.href || "/login");
  return {
    to,
    subject: `${notification.title} | G4 Builders Inc`,
    text: `Hi ${recipientName},\n\n${notification.title}\n${notification.body}\n\nOpen G4 Builders: ${link}`,
    html: layout(
      notification.title,
      `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#57534e">Hi ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:22px;color:#57534e">${escapeHtml(notification.body)}</p>
<a href="${escapeHtml(link)}" style="display:inline-block;background:#b91c1c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 20px;border-radius:8px">Open G4 Builders</a>`,
    ),
  };
}
