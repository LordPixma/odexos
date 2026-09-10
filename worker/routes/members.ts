import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { users } from "../db/schema";
import { generateId, hashPassword } from "../lib/crypto";
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

// List everyone in the family.
members.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const rows = await db.query.users.findMany({
    where: eq(users.familyId, familyId),
    orderBy: [asc(users.createdAt)],
  });
  return c.json({ members: rows.map(toMember) });
});

// Add a new family member (owners and adults only).
members.post("/", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  if (actor.role !== "owner" && actor.role !== "adult") {
    return c.json({ error: "Only owners and adults can add members" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const name = requireString(body.name, "Name", { max: 120 });
  const email = requireEmail(body.email);
  const password = requireString(body.password, "Password", { min: 8, max: 200 });
  const role = requireEnum(body.role, ROLES, "Role");
  const color = optionalString(body.color, "Color", { max: 20 }) ?? "#6366f1";

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return c.json({ error: "That email is already in use" }, 409);

  const id = generateId();
  await db.insert(users).values({
    id,
    familyId: actor.familyId,
    name,
    email,
    passwordHash: await hashPassword(password),
    role,
    color,
  });
  const created = await db.query.users.findFirst({ where: eq(users.id, id) });
  return c.json({ member: created ? toMember(created) : null }, 201);
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

// Remove a member (owners only; cannot remove the last owner or yourself).
members.delete("/:id", async (c) => {
  const db = c.get("db");
  const actor = c.get("user");
  const id = c.req.param("id");

  if (actor.role !== "owner") {
    return c.json({ error: "Only owners can remove members" }, 403);
  }
  if (id === actor.id) {
    return c.json({ error: "You cannot remove yourself" }, 400);
  }

  const target = await db.query.users.findFirst({
    where: and(eq(users.id, id), eq(users.familyId, actor.familyId)),
  });
  if (!target) return c.json({ error: "Member not found" }, 404);

  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true });
});

export default members;
