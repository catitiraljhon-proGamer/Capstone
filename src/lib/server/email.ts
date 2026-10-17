import nodemailer, { type Transporter } from "nodemailer";

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not configured.");
  }
}

type EmailConfig = { host: string; port: number; user: string; pass: string; fromAddress: string; fromName: string };

/**
 * Any SMTP relay (e.g. Brevo) when SMTP_* and EMAIL_FROM are set; otherwise Gmail SMTP with an
 * App Password (Google Account > Security > App passwords).
 */
export function getEmailConfig(): EmailConfig | null {
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "G4 Builders Inc";
  const host = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const fromAddress = process.env.EMAIL_FROM?.trim();
  if (host && smtpUser && smtpPass && fromAddress) {
    return { host, port: Number(process.env.SMTP_PORT) || 587, user: smtpUser, pass: smtpPass, fromAddress, fromName };
  }

  const user = process.env.GMAIL_USER?.trim();
  // Google shows App Passwords in groups of four; the spaces are not part of it.
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !appPassword) return null;
  return { host: "smtp.gmail.com", port: 465, user, pass: appPassword, fromAddress: user, fromName };
}

export function isEmailConfigured() {
  return getEmailConfig() !== null;
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
  emailTransporter?: { key: string; transporter: Transporter };
};

function transporterFor(config: EmailConfig) {
  const key = `${config.host}:${config.port}:${config.user}:${config.pass}`;
  if (globalForEmail.emailTransporter?.key !== key) {
    globalForEmail.emailTransporter = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        // Port 465 is implicit TLS; other ports upgrade with STARTTLS.
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      }),
    };
  }
  return globalForEmail.emailTransporter.transporter;
}

export type EmailMessage = { to: string; subject: string; text: string; html: string };

export async function sendEmail(message: EmailMessage) {
  const config = getEmailConfig();
  if (!config) throw new EmailNotConfiguredError();
  await transporterFor(config).sendMail({
    from: { name: config.fromName, address: config.fromAddress },
    ...message,
  });
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
