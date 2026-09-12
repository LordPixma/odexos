import type { Db } from "../db/client";
import type { UserRow } from "../db/schema";

export interface Bindings {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_NAME: string;

  // Bank integration (all optional — falls back to the built-in mock provider
  // when TrueLayer credentials are not configured).
  BANK_PROVIDER?: string; // "truelayer" | "mock" (auto-detected if unset)
  TRUELAYER_ENV?: string; // "sandbox" | "live" (default: sandbox)
  TRUELAYER_CLIENT_ID?: string;
  TRUELAYER_CLIENT_SECRET?: string; // secret
  TRUELAYER_REDIRECT_URI?: string; // must match the TrueLayer console
  ENCRYPTION_KEY?: string; // secret — encrypts stored bank tokens
  APP_URL?: string; // e.g. https://odexos.example.com (for redirects)

  // Email alert delivery (optional — falls back to logging when unset).
  RESEND_API_KEY?: string; // secret
  RESEND_FROM?: string; // e.g. "OdexOS <alerts@yourdomain.com>"

  // Web Push (optional — the app hides the notification toggle when unset).
  VAPID_PUBLIC_KEY?: string; // handed to the browser when it subscribes
  VAPID_PRIVATE_KEY?: string; // secret
  VAPID_SUBJECT?: string; // mailto: or https: contact for the push service
}

export interface Variables {
  db: Db;
  user: UserRow;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
}
