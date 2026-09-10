import { Hono } from "hono";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { activities, users } from "../db/schema";
import { generateId } from "../lib/crypto";
import { toActivity } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalBool,
  optionalIsoDateTime,
  optionalString,
  requireEnum,
  requireIsoDateTime,
  requireString,
} from "../lib/validate";
import { ACTIVITY_CATEGORIES } from "@shared/types";

const app = new Hono<AppEnv>();

async function assertMemberInFamily(
  db: AppEnv["Variables"]["db"],
  familyId: string,
  memberId: string | null,
): Promise<string | null> {
  if (!memberId) return null;
  const member = await db.query.users.findFirst({
    where: and(eq(users.id, memberId), eq(users.familyId, familyId)),
  });
  if (!member) badRequest("Assigned member is not part of this family");
  return memberId;
}

// List activities, optionally filtered by date range / category / member.
app.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const { from, to, category, memberId } = c.req.query();

  const conditions: SQL[] = [eq(activities.familyId, familyId)];
  if (from) conditions.push(gte(activities.startsAt, new Date(from).toISOString()));
  if (to) conditions.push(lte(activities.startsAt, new Date(to).toISOString()));
  if (category)
    conditions.push(
      eq(
        activities.category,
        requireEnum(category, ACTIVITY_CATEGORIES, "category"),
      ),
    );
  if (memberId) conditions.push(eq(activities.memberId, memberId));

  const rows = await db.query.activities.findMany({
    where: and(...conditions),
    orderBy: [asc(activities.startsAt)],
    limit: 500,
  });
  return c.json({ activities: rows.map(toActivity) });
});

app.post("/", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const title = requireString(body.title, "Title", { max: 200 });
  const category = requireEnum(body.category, ACTIVITY_CATEGORIES, "Category");
  const startsAt = requireIsoDateTime(body.startsAt, "Start time");
  const endsAt = optionalIsoDateTime(body.endsAt, "End time");
  if (endsAt && new Date(endsAt) < new Date(startsAt)) {
    badRequest("End time must be after the start time");
  }
  const memberId = await assertMemberInFamily(
    db,
    user.familyId,
    optionalString(body.memberId, "Member"),
  );

  const id = generateId();
  await db.insert(activities).values({
    id,
    familyId: user.familyId,
    title,
    category,
    location: optionalString(body.location, "Location", { max: 200 }),
    startsAt,
    endsAt,
    allDay: optionalBool(body.allDay),
    memberId,
    notes: optionalString(body.notes, "Notes", { max: 2000 }),
    createdBy: user.id,
  });
  const created = await db.query.activities.findFirst({
    where: eq(activities.id, id),
  });
  return c.json({ activity: created ? toActivity(created) : null }, 201);
});

app.patch("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");

  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Activity not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof activities.$inferInsert> = {};
  if (body.title !== undefined)
    updates.title = requireString(body.title, "Title", { max: 200 });
  if (body.category !== undefined)
    updates.category = requireEnum(body.category, ACTIVITY_CATEGORIES, "Category");
  if (body.location !== undefined)
    updates.location = optionalString(body.location, "Location", { max: 200 });
  if (body.startsAt !== undefined)
    updates.startsAt = requireIsoDateTime(body.startsAt, "Start time");
  if (body.endsAt !== undefined)
    updates.endsAt = optionalIsoDateTime(body.endsAt, "End time");
  if (body.allDay !== undefined) updates.allDay = optionalBool(body.allDay);
  if (body.notes !== undefined)
    updates.notes = optionalString(body.notes, "Notes", { max: 2000 });
  if (body.memberId !== undefined)
    updates.memberId = await assertMemberInFamily(
      db,
      user.familyId,
      optionalString(body.memberId, "Member"),
    );

  const start = updates.startsAt ?? existing.startsAt;
  const end = updates.endsAt !== undefined ? updates.endsAt : existing.endsAt;
  if (end && new Date(end) < new Date(start)) {
    badRequest("End time must be after the start time");
  }

  await db.update(activities).set(updates).where(eq(activities.id, id));
  const updated = await db.query.activities.findFirst({
    where: eq(activities.id, id),
  });
  return c.json({ activity: updated ? toActivity(updated) : null });
});

app.delete("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Activity not found" }, 404);
  await db.delete(activities).where(eq(activities.id, id));
  return c.json({ ok: true });
});

export default app;
