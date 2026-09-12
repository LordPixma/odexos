import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { families, sessions, users } from "../db/schema";
import { appOrigin } from "../lib/bank";
import { currentUser, endSession, startSession } from "../lib/auth";
import {
  generateId,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from "../lib/crypto";
import { createResetToken, sendResetEmail } from "../lib/reset";
import { toMember } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import { requireEmail, requireString } from "../lib/validate";
import type { AuthState, ResetPreview } from "@shared/types";

const DEFAULT_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

const auth = new Hono<AppEnv>();

// Create a brand-new family with its first (owner) member.
auth.post("/register", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));

  const familyName = requireString(body.familyName, "Family name", { max: 120 });
  const name = requireString(body.name, "Your name", { max: 120 });
  const email = requireEmail(body.email);
  const password = requireString(body.password, "Password", { min: 8, max: 200 });

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return c.json({ error: "An account with that email already exists" }, 409);
  }

  const familyId = generateId();
  const userId = generateId();
  await db.insert(families).values({ id: familyId, name: familyName });
  await db.insert(users).values({
    id: userId,
    familyId,
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "owner",
    color: DEFAULT_COLORS[0],
  });

  await startSession(c, db, userId);

  const family = { id: familyId, name: familyName };
  const member = toMember({
    id: userId,
    familyId,
    name,
    email,
    passwordHash: "",
    role: "owner",
    color: DEFAULT_COLORS[0],
    status: "active",
    inviteTokenHash: null,
    inviteExpiresAt: null,
    invitedBy: null,
    invitedAt: null,
    resetTokenHash: null,
    resetExpiresAt: null,
    nickname: null,
    pronouns: null,
    birthday: null,
    avatarVersion: 0,
    notifyBudgetAlerts: true,
    notifyWeeklyDigest: true,
    createdAt: new Date().toISOString(),
  });
  return c.json<AuthState>({ member, family }, 201);
});

auth.post("/login", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));
  const email = requireEmail(body.email);
  const password = requireString(body.password, "Password", { max: 200 });

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (user && user.status === "invited") {
    return c.json(
      {
        error:
          "This invite hasn't been accepted yet — check your email for the invite link to set a password.",
      },
      403,
    );
  }
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "Incorrect email or password" }, 401);
  }

  await startSession(c, db, user.id);
  const family = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  return c.json<AuthState>({
    member: toMember(user),
    family: { id: user.familyId, name: family?.name ?? "" },
  });
});

auth.post("/logout", async (c) => {
  const db = c.get("db");
  await endSession(c, db);
  return c.json({ ok: true });
});

// Request a password-reset link. Always returns ok so the endpoint can't be
// used to probe which emails have accounts.
auth.post("/forgot", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));
  const email = requireEmail(body.email);

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (user && user.status === "active") {
    const { token, tokenHash, expiresAt } = await createResetToken();
    await db
      .update(users)
      .set({ resetTokenHash: tokenHash, resetExpiresAt: expiresAt })
      .where(eq(users.id, user.id));
    const resetUrl = `${appOrigin(c.env, c)}/reset/${token}`;
    try {
      await sendResetEmail(c.env, {
        to: user.email,
        appName: c.env.APP_NAME || "OdexOS",
        name: user.name,
        resetUrl,
      });
    } catch (err) {
      console.error("Reset email failed:", err);
    }
  }
  return c.json({ ok: true });
});

// Validate a reset token so the reset page can render (public).
auth.get("/reset/:token", async (c) => {
  const db = c.get("db");
  const tokenHash = await sha256Hex(c.req.param("token"));
  const user = await db.query.users.findFirst({
    where: eq(users.resetTokenHash, tokenHash),
  });
  if (!user) {
    return c.json({ error: "This reset link is invalid or has already been used." }, 404);
  }
  if (!user.resetExpiresAt || new Date(user.resetExpiresAt).getTime() < Date.now()) {
    return c.json({ error: "This reset link has expired. Request a new one." }, 410);
  }
  return c.json<ResetPreview>({ email: user.email });
});

// Consume a reset token: set a new password, drop existing sessions, sign in.
auth.post("/reset", async (c) => {
  const db = c.get("db");
  const body = await c.req.json().catch(() => ({}));
  const token = requireString(body.token, "Token", { max: 200 });
  const password = requireString(body.password, "Password", { min: 8, max: 200 });

  const tokenHash = await sha256Hex(token);
  const user = await db.query.users.findFirst({
    where: eq(users.resetTokenHash, tokenHash),
  });
  if (!user) {
    return c.json({ error: "This reset link is invalid or has already been used." }, 404);
  }
  if (!user.resetExpiresAt || new Date(user.resetExpiresAt).getTime() < Date.now()) {
    return c.json({ error: "This reset link has expired. Request a new one." }, 410);
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      resetTokenHash: null,
      resetExpiresAt: null,
      status: "active", // a reset also activates a not-yet-accepted invite
    })
    .where(eq(users.id, user.id));

  // Invalidate any existing sessions (in case the account was compromised),
  // then start a fresh one so the reset signs them straight in.
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await startSession(c, db, user.id);

  const family = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  const updated = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  return c.json<AuthState>({
    member: toMember(updated!),
    family: { id: user.familyId, name: family?.name ?? "" },
  });
});

auth.get("/me", async (c) => {
  const db = c.get("db");
  const user = await currentUser(c, db);
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  const family = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  return c.json<AuthState>({
    member: toMember(user),
    family: { id: user.familyId, name: family?.name ?? "" },
  });
});

export default auth;
