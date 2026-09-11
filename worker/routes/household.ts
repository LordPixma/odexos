import { Hono } from "hono";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { listItems, lists, meals, users } from "../db/schema";
import { generateId } from "../lib/crypto";
import { toList, toListItem, toMeal } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalBool,
  optionalString,
  requireDate,
  requireEnum,
  requireString,
} from "../lib/validate";
import {
  LIST_TYPES,
  MEAL_SLOTS,
  type ListWithItems,
} from "@shared/types";

const app = new Hono<AppEnv>();

async function assertMember(
  db: AppEnv["Variables"]["db"],
  familyId: string,
  memberId: string | null,
): Promise<string | null> {
  if (!memberId) return null;
  const m = await db.query.users.findFirst({
    where: and(eq(users.id, memberId), eq(users.familyId, familyId)),
  });
  if (!m) badRequest("Assigned member is not part of this family");
  return memberId;
}

// ---- Lists ----

app.get("/lists", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const listRows = await db.query.lists.findMany({
    where: eq(lists.familyId, familyId),
    orderBy: [asc(lists.createdAt)],
  });
  const ids = listRows.map((l) => l.id);
  const itemRows = ids.length
    ? await db.query.listItems.findMany({
        where: inArray(listItems.listId, ids),
        orderBy: [asc(listItems.position), asc(listItems.createdAt)],
      })
    : [];
  const byList = new Map<string, typeof itemRows>();
  for (const it of itemRows) {
    const arr = byList.get(it.listId) ?? [];
    arr.push(it);
    byList.set(it.listId, arr);
  }
  const result: ListWithItems[] = listRows.map((l) => ({
    ...toList(l),
    items: (byList.get(l.id) ?? []).map(toListItem),
  }));
  return c.json({ lists: result });
});

app.post("/lists", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const name = requireString(body.name, "List name", { max: 120 });
  const type = requireEnum(body.type ?? "custom", LIST_TYPES, "Type");
  const id = generateId();
  await db.insert(lists).values({ id, familyId: user.familyId, name, type, createdBy: user.id });
  const created = await db.query.lists.findFirst({ where: eq(lists.id, id) });
  return c.json({ list: created ? { ...toList(created), items: [] } : null }, 201);
});

app.patch("/lists/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.lists.findFirst({
    where: and(eq(lists.id, id), eq(lists.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "List not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const name = requireString(body.name, "List name", { max: 120 });
  await db.update(lists).set({ name }).where(eq(lists.id, id));
  return c.json({ ok: true });
});

app.delete("/lists/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.lists.findFirst({
    where: and(eq(lists.id, id), eq(lists.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "List not found" }, 404);
  await db.delete(lists).where(eq(lists.id, id));
  return c.json({ ok: true });
});

app.post("/lists/:id/items", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const listId = c.req.param("id");
  const list = await db.query.lists.findFirst({
    where: and(eq(lists.id, listId), eq(lists.familyId, user.familyId)),
  });
  if (!list) return c.json({ error: "List not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const text = requireString(body.text, "Item", { max: 200 });
  const assignedTo = await assertMember(
    db,
    user.familyId,
    optionalString(body.assignedTo, "Assignee"),
  );

  const siblings = await db.query.listItems.findMany({
    where: eq(listItems.listId, listId),
    columns: { position: true },
  });
  const position = siblings.reduce((m, s) => Math.max(m, s.position), 0) + 1;

  const id = generateId();
  await db.insert(listItems).values({
    id,
    listId,
    familyId: user.familyId,
    text,
    assignedTo,
    position,
    createdBy: user.id,
  });
  const created = await db.query.listItems.findFirst({
    where: eq(listItems.id, id),
  });
  return c.json({ item: created ? toListItem(created) : null }, 201);
});

app.post("/lists/:id/clear-done", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const listId = c.req.param("id");
  const list = await db.query.lists.findFirst({
    where: and(eq(lists.id, listId), eq(lists.familyId, familyId)),
  });
  if (!list) return c.json({ error: "List not found" }, 404);
  await db
    .delete(listItems)
    .where(and(eq(listItems.listId, listId), eq(listItems.done, true)));
  return c.json({ ok: true });
});

// ---- List items ----

app.patch("/items/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.listItems.findFirst({
    where: and(eq(listItems.id, id), eq(listItems.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Item not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof listItems.$inferInsert> = {};
  if (body.text !== undefined)
    updates.text = requireString(body.text, "Item", { max: 200 });
  if (body.done !== undefined) updates.done = optionalBool(body.done);
  if (body.assignedTo !== undefined)
    updates.assignedTo = await assertMember(
      db,
      user.familyId,
      optionalString(body.assignedTo, "Assignee"),
    );

  await db.update(listItems).set(updates).where(eq(listItems.id, id));
  const updated = await db.query.listItems.findFirst({
    where: eq(listItems.id, id),
  });
  return c.json({ item: updated ? toListItem(updated) : null });
});

app.delete("/items/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.listItems.findFirst({
    where: and(eq(listItems.id, id), eq(listItems.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "Item not found" }, 404);
  await db.delete(listItems).where(eq(listItems.id, id));
  return c.json({ ok: true });
});

// ---- Meals ----

function mondayOf(now: Date): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

app.get("/meals", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const { from, to } = c.req.query();
  const start =
    from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : mondayOf(new Date());
  const endDate = new Date(`${start}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : endDate.toISOString().slice(0, 10);

  const rows = await db.query.meals.findMany({
    where: and(
      eq(meals.familyId, familyId),
      gte(meals.date, start),
      lte(meals.date, end),
    ),
    orderBy: [asc(meals.date)],
  });
  return c.json({ meals: rows.map(toMeal), weekStart: start });
});

app.post("/meals", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const date = requireDate(body.date, "Date");
  const slot = requireEnum(body.slot, MEAL_SLOTS, "Slot");
  const title = requireString(body.title, "Meal", { max: 200 });
  const notes = optionalString(body.notes, "Notes", { max: 500 });
  const id = generateId();
  await db.insert(meals).values({
    id,
    familyId: user.familyId,
    date,
    slot,
    title,
    notes,
    createdBy: user.id,
  });
  const created = await db.query.meals.findFirst({ where: eq(meals.id, id) });
  return c.json({ meal: created ? toMeal(created) : null }, 201);
});

app.patch("/meals/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.meals.findFirst({
    where: and(eq(meals.id, id), eq(meals.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "Meal not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof meals.$inferInsert> = {};
  if (body.title !== undefined)
    updates.title = requireString(body.title, "Meal", { max: 200 });
  if (body.notes !== undefined)
    updates.notes = optionalString(body.notes, "Notes", { max: 500 });
  if (body.slot !== undefined)
    updates.slot = requireEnum(body.slot, MEAL_SLOTS, "Slot");
  if (body.date !== undefined) updates.date = requireDate(body.date, "Date");
  await db.update(meals).set(updates).where(eq(meals.id, id));
  const updated = await db.query.meals.findFirst({ where: eq(meals.id, id) });
  return c.json({ meal: updated ? toMeal(updated) : null });
});

app.delete("/meals/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.meals.findFirst({
    where: and(eq(meals.id, id), eq(meals.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "Meal not found" }, 404);
  await db.delete(meals).where(eq(meals.id, id));
  return c.json({ ok: true });
});

export default app;
