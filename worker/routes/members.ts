import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { families, memberAvatars, users } from "../db/schema";
import { generateId } from "../lib/crypto";
import { appOrigin } from "../lib/bank";
import { createInviteToken, sendInviteEmail } from "../lib/invite";
import { toMember } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalDate,
  optionalString,
  requireAmountCents,
  requireEmail,
  requireEnum,
  requireString,
} from "../lib/validate";
import { MAX_PARENTS, MEMBER_COLORS, isParent } from "@shared/types";
import type { Role } from "@shared/types";

const ROLES: readonly Role[] = ["owner", "parent", "child", "member"];

const members = new Hono<AppEnv>();

/**
 * A family has at most two parents, and the owner is one of them. Throws when
 * adding another would exceed that — `exclude` skips the member being changed
 * so promoting someone already counted doesn't trip over itself.
 */
async function assertParentSlotFree(
  db: AppEnv["Variables"]["db"],
  familyId: string,
  exclude?: string,
): Promise<void> {
  const existing = await db.query.users.findMany({
    where: eq(users.familyId, familyId),
    columns: { id: true, role: true },
  });
  const parents = existing.filter(
    (m) => isParent(m.role) && m.id !== exclude,
  ).length;
  if (parents >= MAX_PARENTS) {
    badRequest(
      `A family can have at most ${MAX_PARENTS} parents. Change one to a child or member first.`,
    );
  }
}

// List everyone in the family (active members + outstanding invites).
members.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const rows = await db.query.users.findMany({
    where: eq(users.familyId, familyId),
    orderBy: [asc(users.createdAt)],
  });
  return c.json({ members: rows.map(toMember) });
});

// Invite a new family member by email (parents only). Creates a
// pending account and emails them a link to set their own password.
members.post("/", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  if (!isParent(actor.role)) {
    return c.json({ error: "Only parents can invite members" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const name = requireString(body.name, "Name", { max: 120 });
  const email = requireEmail(body.email);
  const role = requireEnum(body.role, ROLES, "Role");
  if (isParent(role)) await assertParentSlotFree(db, actor.familyId);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return c.json({ error: "That email is already in use" }, 409);

  // Hand out the first colour nobody in the family has taken, so members are
  // told apart at a glance instead of all sharing the default.
  const family = await db.query.users.findMany({
    where: eq(users.familyId, actor.familyId),
    columns: { color: true },
  });
  const taken = new Set(family.map((m) => m.color));
  const color =
    optionalString(body.color, "Color", { max: 20 }) ??
    MEMBER_COLORS.find((hex) => !taken.has(hex)) ??
    MEMBER_COLORS[family.length % MEMBER_COLORS.length];

  const { token, tokenHash, expiresAt } = await createInviteToken();
  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(users).values({
    id,
    familyId: actor.familyId,
    name,
    email,
    passwordHash: "", // set when the invite is accepted
    role,
    color,
    status: "invited",
    inviteTokenHash: tokenHash,
    inviteExpiresAt: expiresAt,
    invitedBy: actor.id,
    invitedAt: now,
  });

  const created = await db.query.users.findFirst({ where: eq(users.id, id) });
  const emailResult = await deliverInvite(c, token, created!.name, email);

  return c.json(
    {
      member: created ? toMember(created) : null,
      emailSent: emailResult.sent,
      emailProvider: emailResult.provider,
    },
    201,
  );
});

// Resend the invite email for a pending member (parents only).
// Mints a fresh token so the previous link is invalidated.
members.post("/:id/resend", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  const id = c.req.param("id");

  if (!isParent(actor.role)) {
    return c.json({ error: "Only parents can resend invites" }, 403);
  }

  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.familyId, actor.familyId)),
  });
  if (!target) return c.json({ error: "Member not found" }, 404);
  if (target.status !== "invited") {
    return c.json({ error: "That member has already joined" }, 400);
  }

  const { token, tokenHash, expiresAt } = await createInviteToken();
  await db
    .update(users)
    .set({
      inviteTokenHash: tokenHash,
      inviteExpiresAt: expiresAt,
      invitedAt: new Date().toISOString(),
      invitedBy: actor.id,
    })
    .where(eq(users.id, id));

  const emailResult = await deliverInvite(c, token, target.name, target.email);
  return c.json({
    emailSent: emailResult.sent,
    emailProvider: emailResult.provider,
  });
});

// Update a member's display details (and role, owners only).
members.patch("/:id", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  const id = c.req.param("id");

  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.familyId, actor.familyId)),
  });
  if (!target) return c.json({ error: "Member not found" }, 404);

  const isSelf = target.id === actor.id;
  if (!isSelf && !isParent(actor.role)) {
    return c.json({ error: "Not allowed" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof users.$inferInsert> = {};
  if (body.name !== undefined)
    updates.name = requireString(body.name, "Name", { max: 120 });
  if (body.color !== undefined)
    updates.color = optionalString(body.color, "Color", { max: 20 }) ?? target.color;
  if (body.role !== undefined) {
    if (actor.role !== "owner") badRequest("Only owners can change roles");
    const next = requireEnum(body.role, ROLES, "Role");
    if (isParent(next) && !isParent(target.role)) {
      await assertParentSlotFree(db, actor.familyId, target.id);
    }
    updates.role = next;
  }
  // --- personalisation ---
  if (body.nickname !== undefined)
    updates.nickname = optionalString(body.nickname, "Nickname", { max: 60 });
  if (body.pronouns !== undefined)
    updates.pronouns = optionalString(body.pronouns, "Pronouns", { max: 40 });
  if (body.birthday !== undefined) {
    updates.birthday = optionalDate(body.birthday, "Birthday");
  }
  if (body.allowance !== undefined) {
    if (!isParent(actor.role)) badRequest("Only parents can set an allowance");
    const pence = requireAmountCents(body.allowance, "Allowance");
    if (pence < 0) badRequest("An allowance cannot be negative");
    updates.allowanceCents = pence;
  }
  if (body.notifyBudgetAlerts !== undefined)
    updates.notifyBudgetAlerts = Boolean(body.notifyBudgetAlerts);
  if (body.notifyWeeklyDigest !== undefined)
    updates.notifyWeeklyDigest = Boolean(body.notifyWeeklyDigest);

  if (Object.keys(updates).length === 0) return c.json({ member: toMember(target) });

  await db.update(users).set(updates).where(eq(users.id, id));
  const updated = await db.query.users.findFirst({ where: eq(users.id, id) });
  return c.json({ member: updated ? toMember(updated) : null });
});

// Remove a member, or revoke a pending invite.
// - Revoking a pending invite: parents.
// - Removing an active member: owners only. Cannot remove yourself.
members.delete("/:id", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  const id = c.req.param("id");

  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.familyId, actor.familyId)),
  });
  if (!target) return c.json({ error: "Member not found" }, 404);

  if (target.status === "invited") {
    if (!isParent(actor.role)) {
      return c.json({ error: "Only parents can revoke invites" }, 403);
    }
  } else {
    if (actor.role !== "owner") {
      return c.json({ error: "Only owners can remove members" }, 403);
    }
    if (id === actor.id) {
      return c.json({ error: "You cannot remove yourself" }, 400);
    }
  }

  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Profile photos
// ---------------------------------------------------------------------------

/** Base64 payload cap (~400KB) — the browser crops to a small WebP first. */
const MAX_AVATAR_B64 = 400 * 1024;
const AVATAR_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Resolve a member in the actor's family, or null. */
async function familyMember(
  c: Context<AppEnv>,
  id: string,
): Promise<typeof users.$inferSelect | undefined> {
  const db = c.get("db");
  const actor = c.get("user");
  return db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.familyId, actor.familyId)),
  });
}

// Serve a member's photo. Auth'd + family-scoped; the ?v= in the URL means we
// can cache hard.
members.get("/:id/avatar", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const target = await familyMember(c, id);
  if (!target) return c.json({ error: "Member not found" }, 404);

  const row = await db.query.memberAvatars.findFirst({
    where: eq(memberAvatars.userId, id),
  });
  if (!row) return c.json({ error: "No photo" }, 404);

  const bytes = base64ToBytes(row.data);
  return new Response(bytes, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});

// Upload/replace a member's photo (self, or owners/adults for anyone).
members.post("/:id/avatar", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  const id = c.req.param("id");
  const target = await familyMember(c, id);
  if (!target) return c.json({ error: "Member not found" }, 404);
  if (target.id !== actor.id && !isParent(actor.role)) {
    return c.json({ error: "Not allowed" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const dataUrl = requireString(body.dataUrl, "Image", { max: 1_500_000 });
  const match = AVATAR_DATA_URL.exec(dataUrl);
  if (!match) badRequest("Photo must be a PNG, JPEG or WebP image");
  const [, mime, data] = match!;
  if (data.length > MAX_AVATAR_B64) {
    badRequest("That photo is too large — try a smaller one");
  }

  const existing = await db.query.memberAvatars.findFirst({
    where: eq(memberAvatars.userId, id),
  });
  if (existing) {
    await db
      .update(memberAvatars)
      .set({ mime, data, updatedAt: new Date().toISOString() })
      .where(eq(memberAvatars.userId, id));
  } else {
    await db.insert(memberAvatars).values({ userId: id, mime, data });
  }
  await db
    .update(users)
    .set({ avatarVersion: target.avatarVersion + 1 })
    .where(eq(users.id, id));

  const updated = await db.query.users.findFirst({ where: eq(users.id, id) });
  return c.json({ member: updated ? toMember(updated) : null });
});

// Remove a member's photo.
members.delete("/:id/avatar", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  const id = c.req.param("id");
  const target = await familyMember(c, id);
  if (!target) return c.json({ error: "Member not found" }, 404);
  if (target.id !== actor.id && !isParent(actor.role)) {
    return c.json({ error: "Not allowed" }, 403);
  }

  await db.delete(memberAvatars).where(eq(memberAvatars.userId, id));
  await db.update(users).set({ avatarVersion: 0 }).where(eq(users.id, id));
  const updated = await db.query.users.findFirst({ where: eq(users.id, id) });
  return c.json({ member: updated ? toMember(updated) : null });
});

/** Send the invite email, tolerating provider failures (so the invite still
 * exists and can be resent from the UI). */
async function deliverInvite(
  c: Context<AppEnv>,
  token: string,
  inviteeName: string,
  toEmail: string,
): Promise<{ sent: boolean; provider: string }> {
  const db = c.get("db");
  const actor = c.get("user");
  const family = await db.query.families.findFirst({
    where: eq(families.id, actor.familyId),
  });
  const acceptUrl = `${appOrigin(c.env, c)}/invite/${token}`;
  try {
    const provider = await sendInviteEmail(c.env, {
      to: toEmail,
      appName: c.env.APP_NAME || "OdexOS",
      familyName: family?.name ?? "your family",
      inviterName: actor.name,
      inviteeName,
      acceptUrl,
    });
    return { sent: provider !== "log", provider };
  } catch (err) {
    console.error("Invite email failed:", err);
    return { sent: false, provider: "error" };
  }
}

export default members;
