import { generateToken, sha256Hex } from "./crypto";
import { getEmailProvider } from "./email";
import type { Bindings } from "./types";

/** How long an emailed invite stays valid. */
export const INVITE_TTL_HOURS = 72;

export interface NewInviteToken {
  token: string; // raw token — goes in the emailed link, never stored
  tokenHash: string; // SHA-256 of the token — stored on the user row
  expiresAt: string; // ISO 8601
}

/** Mint a fresh invite token + its hash + expiry. */
export async function createInviteToken(): Promise<NewInviteToken> {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000,
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

interface InviteEmailInput {
  appName: string;
  familyName: string;
  inviterName: string;
  inviteeName: string;
  acceptUrl: string;
}

export function buildInviteEmail(input: InviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const { appName, familyName, inviterName, inviteeName, acceptUrl } = input;
  const subject = `${inviterName} invited you to join ${familyName} on ${appName}`;

  const text = [
    `Hi ${inviteeName},`,
    "",
    `${inviterName} has invited you to join "${familyName}" on ${appName} — the family's shared command center for schedules, expenses and plans.`,
    "",
    "Accept your invite and set a password here:",
    acceptUrl,
    "",
    `This link expires in ${INVITE_TTL_HOURS} hours. If you weren't expecting this, you can ignore this email.`,
    "",
    `— ${appName}`,
  ].join("\n");

  const safe = {
    appName: escapeHtml(appName),
    familyName: escapeHtml(familyName),
    inviterName: escapeHtml(inviterName),
    inviteeName: escapeHtml(inviteeName),
    acceptUrl: escapeHtml(acceptUrl),
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
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;font-weight:700;">You're invited to join<br>${safe.familyName}</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3a4a42;">
            Hi ${safe.inviteeName}, <strong>${safe.inviterName}</strong> has invited you to
            ${safe.appName} — your family's shared space for schedules, expenses and plans.
          </p>
          <a href="${safe.acceptUrl}"
             style="display:inline-block;background:#0f8a5f;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">
            Accept invite &amp; set password
          </a>
          <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#7c8b83;">
            Or paste this link into your browser:<br>
            <a href="${safe.acceptUrl}" style="color:#0f8a5f;word-break:break-all;">${safe.acceptUrl}</a>
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#9aa8a0;">
            This invite expires in ${INVITE_TTL_HOURS} hours. If you weren't expecting it, you can safely ignore this email.
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

/** Build and send the invite email. Returns the provider id used. */
export async function sendInviteEmail(
  env: Bindings,
  input: InviteEmailInput & { to: string },
): Promise<string> {
  const provider = getEmailProvider(env);
  const { subject, text, html } = buildInviteEmail(input);
  await provider.send({ to: [input.to], subject, text, html });
  return provider.id;
}
