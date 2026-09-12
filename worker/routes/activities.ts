import { Hono } from "hono";
import { and, eq, gte, lte, ne, type SQL } from "drizzle-orm";
import { activities, users } from "../db/schema";
import { generateId } from "../lib/crypto";
import { toActivity } from "../lib/serialize";
import { expandActivities } from "../lib/recurrence";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalBool,
  optionalEnum,
  optionalDate,
  optionalIsoDateTime,
  optionalString,
  requireEnum,
  requireIsoDateTime,
  requireString,
} from "../lib/validate";
import { ACTIVITY_CATEGORIES, RECURRENCE_RULES } from "@shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;

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

// List activities within a window, expanding recurring series into occurrences.
app.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const { from, to, category, memberId } = c.req.query();

  const now = new Date();
  const fromDate = from ? new Date(from) : new Date(now.getTime() - 365 * DAY_MS);
  const toDate = to
    ? new Date(to)
    : new Date(Math.max(fromDate.getTime(), now.getTime()) + 120 * DAY_MS);

  const filters: SQL[] = [eq(activities.familyId, familyId)];
  if (category)
    filters.push(
      eq(activities.category, requireEnum(category, ACTIVITY_CATEGORIES, "category")),
    );
  if (memberId) filters.push(eq(activities.memberId, memberId));

  // Non-recurring activities that fall inside the window...
  const nonRecurring = await db.query.activities.findMany({
    where: and(
      ...filters,
      eq(activities.recurrence, "none"),
      gte(activities.startsAt, fromDate.toISOString()),
      lte(activities.startsAt, toDate.toISOString()),
    ),
    limit: 1000,
  });
  // ...plus every recurring series (occurrences may land in the window even
  // when the series began before it).
  const recurring = await db.query.activities.findMany({
    where: and(...filters, ne(activities.recurrence, "none")),
    limit: 500,
  });

  const base = [...nonRecurring, ...recurring].map(toActivity);
  const expanded = expandActivities(base, fromDate, toDate);
  return c.json({ activities: expanded });
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
    recurrence: optionalEnum(body.recurrence, RECURRENCE_RULES, "Recurrence", "none"),
    recurrenceUntil: optionalDate(body.recurrenceUntil, "Repeat until"),
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
  const id = c.req.param("id").split("@")[0]; // occurrence id → base series id

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
  if (body.recurrence !== undefined)
    updates.recurrence = requireEnum(body.recurrence, RECURRENCE_RULES, "Recurrence");
  if (body.recurrenceUntil !== undefined)
    updates.recurrenceUntil = optionalDate(body.recurrenceUntil, "Repeat until");

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
  const id = c.req.param("id").split("@")[0]; // occurrence id → base series id
  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Activity not found" }, 404);
  await db.delete(activities).where(eq(activities.id, id));
  return c.json({ ok: true });
});

export default app;
