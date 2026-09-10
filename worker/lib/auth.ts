import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";
import type { UserRow } from "../db/schema";
import type { AppEnv } from "./types";
import { generateToken } from "./crypto";

export const SESSION_COOKIE = "odex_session";
const SESSION_TTL_DAYS = 30;

function expiryDate(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function isSecureRequest(c: Context<AppEnv>): boolean {
  try {
    return new URL(c.req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Create a session row and set the session cookie. */
export async function startSession(
  c: Context<AppEnv>,
  db: Db,
  userId: string,
): Promise<void> {
  const token = generateToken();
  const expires = expiryDate(SESSION_TTL_DAYS);
  await db.insert(sessions).values({
    id: token,
    userId,
    expiresAt: expires.toISOString(),
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

/** Resolve the current member from the session cookie, or null. */
export async function currentUser(
  c: Context<AppEnv>,
  db: Db,
): Promise<UserRow | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, token),
  });
  if (!session) return null;

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });
  return user ?? null;
}

/** Destroy the current session and clear the cookie. */
export async function endSession(c: Context<AppEnv>, db: Db): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
