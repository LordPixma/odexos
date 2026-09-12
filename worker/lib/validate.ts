import { HTTPException } from "hono/http-exception";

// Small, dependency-free validation helpers. Each throws an HTTPException(400)
// with a clear message on failure, which the app's error handler renders as
// { error: string }.

export function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

export function requireString(
  value: unknown,
  field: string,
  { min = 1, max = 2000 }: { min?: number; max?: number } = {},
): string {
  if (typeof value !== "string") badRequest(`${field} is required`);
  const trimmed = (value as string).trim();
  if (trimmed.length === 0) badRequest(`${field} is required`);
  if (trimmed.length < min)
    badRequest(`${field} must be at least ${min} characters`);
  if (trimmed.length > max) badRequest(`${field} is too long`);
  return trimmed;
}

export function optionalString(
  value: unknown,
  field: string,
  { max = 2000 }: { max?: number } = {},
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") badRequest(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) badRequest(`${field} is too long`);
  return trimmed;
}

export function requireEmail(value: unknown): string {
  const email = requireString(value, "Email", { max: 320 }).toLowerCase();
  // Deliberately permissive — good enough to catch obvious mistakes.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) badRequest("Email is invalid");
  return email;
}

export function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    badRequest(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
  fallback: T,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  return requireEnum(value, allowed, field);
}

/** Parses a money amount given in major units (e.g. pounds) into integer cents. */
export function requireAmountCents(value: unknown, field = "Amount"): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : NaN;
  if (!Number.isFinite(num)) badRequest(`${field} must be a number`);
  return Math.round(num * 100);
}

export function optionalBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

/** Validates an ISO-8601 datetime string. */
export function requireIsoDateTime(value: unknown, field: string): string {
  const s = requireString(value, field);
  const t = Date.parse(s);
  if (Number.isNaN(t)) badRequest(`${field} must be a valid date/time`);
  return new Date(t).toISOString();
}

export function optionalIsoDateTime(
  value: unknown,
  field: string,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireIsoDateTime(value, field);
}

/**
 * Validates a YYYY-MM-DD date string, and that the date actually exists.
 *
 * The shape check alone isn't enough, and neither is Date.parse: it happily
 * accepts "1990-02-29" and "2026-04-31", rolling them over to the 1st of the
 * next month. A stored non-date then surfaces as a broken day in the calendar
 * feed, so the only reliable test is that it round-trips unchanged.
 */
export function requireDate(value: unknown, field: string): string {
  const s = requireString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) badRequest(`${field} must be YYYY-MM-DD`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    badRequest(`${field} is not a real date`);
  }
  return s;
}

/** As `requireDate`, but empty/absent becomes null. */
export function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireDate(value, field);
}
