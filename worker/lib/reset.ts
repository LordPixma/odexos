import { generateToken, sha256Hex } from "./crypto";
import { getEmailProvider } from "./email";
import type { Bindings } from "./types";

/** How long a password-reset link stays valid. */
export const RESET_TTL_MINUTES = 60;

export interface NewResetToken {
  token: string; // raw token — goes in the emailed link, never stored
  tokenHash: string; // SHA-256 of the token — stored on the user row
  expiresAt: string; // ISO 8601
}

export async function createResetToken(): Promise<NewResetToken> {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + RESET_TTL_MINUTES * 60 * 1000,
  ).toISOString();
  return { token, tokenHash, expiresAt };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ResetEmailInput {
  appName: string;
  name: string;
  resetUrl: string;
}

export function buildResetEmail(input: ResetEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const { appName, name, resetUrl } = input;
  const subject = `Reset your ${appName} password`;

  const text = [
    `Hi ${name},`,
    "",
    `We received a request to reset the password for your ${appName} account.`,
    "",
    "Set a new password here:",
    resetUrl,
    "",
    `This link expires in ${RESET_TTL_MINUTES} minutes. If you didn't request this, you can safely ignore this email — your password won't change.`,
    "",
    `— ${appName}`,
  ].join("\n");

  const safe = {
    appName: escapeHtml(appName),
    name: escapeHtml(name),
    resetUrl: escapeHtml(resetUrl),
  };

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f6f4ee;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2b24;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
      <tr>
        <td style="padding:8px 4px 20px;">
          <span style="display:inline-flex;align-items:center;gap:10px;">
            <span style="display:inline-block;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#1fa471,#0b6b46);color:#fff;font-weight:700;text-align:center;line-height:34px;font-size:18px;">O</span>
            <span style="font-size:18px;font-weight:700;letter-spacing:-0.01em;">${safe.appName}</span>
          </span>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;border:1px solid rgba(0,0,0,0.06);border-radius:18px;padding:32px;box-shadow:0 10px 30px rgba(11,43,32,0.06);">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;font-weight:700;">Reset your password</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3a4a42;">
            Hi ${safe.name}, we got a request to reset your ${safe.appName} password. Click below to choose a new one.
          </p>
          <a href="${safe.resetUrl}"
             style="display:inline-block;background:#0f8a5f;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">
            Set a new password
          </a>
          <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#7c8b83;">
            Or paste this link into your browser:<br>
            <a href="${safe.resetUrl}" style="color:#0f8a5f;word-break:break-all;">${safe.resetUrl}</a>
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#9aa8a0;">
            This link expires in ${RESET_TTL_MINUTES} minutes. If you didn't request it, ignore this email — your password won't change.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 4px;color:#9aa8a0;font-size:12px;">
          Sent by ${safe.appName} · Built on Cloudflare
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

/** Build and send the reset email. Returns the provider id used. */
export async function sendResetEmail(
  env: Bindings,
  input: ResetEmailInput & { to: string },
): Promise<string> {
  const provider = getEmailProvider(env);
  const { subject, text, html } = buildResetEmail(input);
  await provider.send({ to: [input.to], subject, text, html });
  return provider.id;
}
