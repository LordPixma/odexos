import type { Bindings } from "./types";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  id: string;
  send(message: EmailMessage): Promise<void>;
}

/** Default provider: logs the email instead of sending (dev / unconfigured). */
class LogProvider implements EmailProvider {
  id = "log";
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `[email:log] to=${message.to.join(",")} subject="${message.subject}"\n${message.text}`,
    );
  }
}

/** Sends via the Resend HTTP API. */
class ResendProvider implements EmailProvider {
  id = "resend";
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed (${res.status}): ${await res.text()}`);
    }
  }
}

export function getEmailProvider(env: Bindings): EmailProvider {
  if (env.RESEND_API_KEY && env.RESEND_FROM) {
    return new ResendProvider(env.RESEND_API_KEY, env.RESEND_FROM);
  }
  return new LogProvider();
}
