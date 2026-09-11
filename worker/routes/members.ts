import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { families, users } from "../db/schema";
import { generateId } from "../lib/crypto";
import { appOrigin } from "../lib/bank";
import { createInviteToken, sendInviteEmail } from "../lib/invite";
import { toMember } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalString,
  requireEmail,
  requireEnum,
  requireString,
} from "../lib/validate";
import type { Role } from "@shared/types";

const ROLES: readonly Role[] = ["owner", "adult", "child", "member"];

const members = new Hono<AppEnv>();

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

// Invite a new family member by email (owners and adults only). Creates a
// pending account and emails them a link to set their own password.
members.post("/", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  if (actor.role !== "owner" && actor.role !== "adult") {
    return c.json({ error: "Only owners and adults can invite members" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const name = requireString(body.name, "Name", { max: 120 });
  const email = requireEmail(body.email);
  const role = requireEnum(body.role, ROLES, "Role");
  const color = optionalString(body.color, "Color", { max: 20 }) ?? "#6366f1";

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return c.json({ error: "That email is already in use" }, 409);

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

// Resend the invite email for a pending member (owners and adults only).
// Mints a fresh token so the previous link is invalidated.
members.post("/:id/resend", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  const id = c.req.param("id");

  if (actor.role !== "owner" && actor.role !== "adult") {
    return c.json({ error: "Only owners and adults can resend invites" }, 403);
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
  if (!isSelf && actor.role !== "owner" && actor.role !== "adult") {
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
    updates.role = requireEnum(body.role, ROLES, "Role");
  }

  if (Object.keys(updates).length === 0) return c.json({ member: toMember(target) });

  await db.update(users).set(updates).where(eq(users.id, id));
  const updated = await db.query.users.findFirst({ where: eq(users.id, id) });
  return c.json({ member: updated ? toMember(updated) : null });
});

// Remove a member, or revoke a pending invite.
// - Revoking a pending invite: owners and adults.
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
    if (actor.role !== "owner" && actor.role !== "adult") {
      return c.json({ error: "Only owners and adults can revoke invites" }, 403);
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
