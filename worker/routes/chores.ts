import { Hono } from "hono";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { choreCompletions, chores, users } from "../db/schema";
import type { ChoreRow } from "../db/schema";
import { generateId } from "../lib/crypto";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalBool,
  optionalString,
  requireEnum,
  requireString,
} from "../lib/validate";
import {
  CHORE_CADENCES,
  type Chore,
  type ChoreCadence,
  type ChoreScore,
  type ChoresOverview,
} from "@shared/types";

const app = new Hono<AppEnv>();

const DAY_MS = 86_400_000;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Roll a due date forward by one cadence step. */
function advance(dueDate: string, cadence: ChoreCadence): string {
  const d = parseYmd(dueDate);
  if (cadence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (cadence === "monthly") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    // clamp (31st → 30th/28th)
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  }
  return d.toISOString().slice(0, 10);
}

/** Monday of the current week, UTC. */
function weekStart(): string {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // Mon = 0
  const mon = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow),
  );
  return mon.toISOString().slice(0, 10);
}

function toChore(
  row: ChoreRow,
  doneToday: boolean,
  lastCompletedAt: string | null,
): Chore {
  const today = todayYmd();
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    notes: row.notes,
    assignedTo: row.assignedTo,
    cadence: row.cadence,
    dueDate: row.dueDate,
    points: row.points,
    rotate: row.rotate,
    streak: row.streak,
    archived: row.archived,
    createdAt: row.createdAt,
    status:
      row.dueDate < today ? "overdue" : row.dueDate === today ? "today" : "upcoming",
    doneToday,
    lastCompletedAt,
  };
}

async function assertMember(
  db: AppEnv["Variables"]["db"],
  familyId: string,
  memberId: string | null,
): Promise<string | null> {
  if (!memberId) return null;
  const found = await db.query.users.findFirst({
    where: and(eq(users.id, memberId), eq(users.familyId, familyId)),
  });
  if (!found) badRequest("That family member doesn't exist");
  return memberId;
}

// List chores + this week's tallies.
app.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const includeArchived = c.req.query("archived") === "1";

  const rows = await db.query.chores.findMany({
    where: includeArchived
      ? eq(chores.familyId, familyId)
      : and(eq(chores.familyId, familyId), eq(chores.archived, false)),
    orderBy: [asc(chores.dueDate), asc(chores.createdAt)],
  });

  // Completions for this week (tallies) and today (done state).
  const since = weekStart();
  const weekRows = await db.query.choreCompletions.findMany({
    where: and(
      eq(choreCompletions.familyId, familyId),
      gte(choreCompletions.completedAt, since),
    ),
    orderBy: [desc(choreCompletions.completedAt)],
  });

  const today = todayYmd();
  const doneTodayByChore = new Set<string>();
  const lastByChore = new Map<string, string>();
  const scoreMap = new Map<string, ChoreScore>();
  for (const comp of weekRows) {
    if (comp.completedAt.slice(0, 10) === today) doneTodayByChore.add(comp.choreId);
    if (!lastByChore.has(comp.choreId)) lastByChore.set(comp.choreId, comp.completedAt);
    if (comp.memberId) {
      const s = scoreMap.get(comp.memberId) ?? {
        memberId: comp.memberId,
        done: 0,
        points: 0,
      };
      s.done += 1;
      s.points += comp.points;
      scoreMap.set(comp.memberId, s);
    }
  }

  const list = rows.map((r) =>
    toChore(r, doneTodayByChore.has(r.id), lastByChore.get(r.id) ?? null),
  );
  const overview: ChoresOverview = {
    chores: list,
    doneThisWeek: weekRows.length,
    openToday: list.filter(
      (ch) => !ch.archived && !ch.doneToday && ch.status !== "upcoming",
    ).length,
    scores: [...scoreMap.values()].sort((a, b) => b.points - a.points || b.done - a.done),
  };
  return c.json(overview);
});

app.post("/", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const title = requireString(body.title, "Title", { max: 160 });
  const cadence = requireEnum(body.cadence ?? "weekly", CHORE_CADENCES, "Cadence");
  const dueDate = optionalString(body.dueDate, "Due date", { max: 10 }) ?? todayYmd();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) badRequest("Due date must be YYYY-MM-DD");
  const assignedTo = await assertMember(
    db,
    user.familyId,
    optionalString(body.assignedTo, "Assignee"),
  );
  const points = Number.isFinite(Number(body.points)) ? Number(body.points) : 0;
  if (points < 0 || points > 1000) badRequest("Points must be between 0 and 1000");

  const id = generateId();
  await db.insert(chores).values({
    id,
    familyId: user.familyId,
    title,
    notes: optionalString(body.notes, "Notes", { max: 500 }),
    assignedTo,
    cadence,
    dueDate,
    points,
    rotate: optionalBool(body.rotate, false),
    createdBy: user.id,
  });
  const created = await db.query.chores.findFirst({ where: eq(chores.id, id) });
  return c.json({ chore: created ? toChore(created, false, null) : null }, 201);
});

app.patch("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.chores.findFirst({
    where: and(eq(chores.id, id), eq(chores.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Chore not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof chores.$inferInsert> = {};
  if (body.title !== undefined)
    updates.title = requireString(body.title, "Title", { max: 160 });
  if (body.notes !== undefined)
    updates.notes = optionalString(body.notes, "Notes", { max: 500 });
  if (body.cadence !== undefined)
    updates.cadence = requireEnum(body.cadence, CHORE_CADENCES, "Cadence");
  if (body.dueDate !== undefined) {
    const d = requireString(body.dueDate, "Due date", { max: 10 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) badRequest("Due date must be YYYY-MM-DD");
    updates.dueDate = d;
  }
  if (body.assignedTo !== undefined) {
    updates.assignedTo = await assertMember(
      db,
      user.familyId,
      optionalString(body.assignedTo, "Assignee"),
    );
  }
  if (body.points !== undefined) {
    const p = Number(body.points);
    if (!Number.isFinite(p) || p < 0 || p > 1000) badRequest("Points must be 0–1000");
    updates.points = p;
  }
  if (body.rotate !== undefined) updates.rotate = Boolean(body.rotate);
  if (body.archived !== undefined) updates.archived = Boolean(body.archived);

  if (Object.keys(updates).length > 0) {
    await db.update(chores).set(updates).where(eq(chores.id, id));
  }
  const updated = await db.query.chores.findFirst({ where: eq(chores.id, id) });
  return c.json({ chore: updated ? toChore(updated, false, null) : null });
});

app.delete("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.chores.findFirst({
    where: and(eq(chores.id, id), eq(chores.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Chore not found" }, 404);
  await db.delete(chores).where(eq(chores.id, id));
  return c.json({ ok: true });
});

// Tick a chore off: record the occurrence, bump the streak, roll the due date
// forward (and optionally hand it to the next person).
app.post("/:id/complete", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const chore = await db.query.chores.findFirst({
    where: and(eq(chores.id, id), eq(chores.familyId, user.familyId)),
  });
  if (!chore) return c.json({ error: "Chore not found" }, 404);
  if (chore.archived) return c.json({ error: "That chore is archived" }, 400);

  const body = await c.req.json().catch(() => ({}));
  const byMember =
    (await assertMember(db, user.familyId, optionalString(body.memberId, "Member"))) ??
    chore.assignedTo ??
    user.id;

  // One completion per occurrence...
  const already = await db.query.choreCompletions.findFirst({
    where: and(
      eq(choreCompletions.choreId, id),
      eq(choreCompletions.forDate, chore.dueDate),
    ),
  });
  if (already) return c.json({ error: "That one's already done" }, 409);

  // ...and at most one a day, so a double-tap doesn't also tick off tomorrow's
  // occurrence (completing rolls the due date forward).
  const doneToday = await db.query.choreCompletions.findFirst({
    where: and(
      eq(choreCompletions.choreId, id),
      gte(choreCompletions.completedAt, todayYmd()),
    ),
  });
  if (doneToday) return c.json({ error: "Already done today" }, 409);

  await db.insert(choreCompletions).values({
    id: generateId(),
    choreId: id,
    familyId: user.familyId,
    memberId: byMember,
    forDate: chore.dueDate,
    points: chore.points,
  });

  // On time keeps the streak going; late resets it.
  const onTime = chore.dueDate >= todayYmd();
  const streak = onTime ? chore.streak + 1 : 0;

  if (chore.cadence === "once") {
    await db
      .update(chores)
      .set({ archived: true, streak })
      .where(eq(chores.id, id));
  } else {
    // Skip any occurrences already missed so the next due date is in the future.
    let next = advance(chore.dueDate, chore.cadence);
    const today = todayYmd();
    let guard = 0;
    while (next < today && guard++ < 400) next = advance(next, chore.cadence);

    let assignedTo = chore.assignedTo;
    if (chore.rotate) {
      const family = await db.query.users.findMany({
        where: eq(users.familyId, user.familyId),
        orderBy: [asc(users.createdAt)],
        columns: { id: true },
      });
      if (family.length > 1) {
        const idx = family.findIndex((m) => m.id === (chore.assignedTo ?? byMember));
        assignedTo = family[(idx + 1 + family.length) % family.length].id;
      }
    }
    await db
      .update(chores)
      .set({ dueDate: next, streak, assignedTo })
      .where(eq(chores.id, id));
  }

  const updated = await db.query.chores.findFirst({ where: eq(chores.id, id) });
  return c.json({ chore: updated ? toChore(updated, true, new Date().toISOString()) : null });
});

// Undo the most recent completion (roll the due date back to it).
app.post("/:id/undo", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const chore = await db.query.chores.findFirst({
    where: and(eq(chores.id, id), eq(chores.familyId, user.familyId)),
  });
  if (!chore) return c.json({ error: "Chore not found" }, 404);

  const last = await db.query.choreCompletions.findFirst({
    where: eq(choreCompletions.choreId, id),
    orderBy: [desc(choreCompletions.completedAt)],
  });
  if (!last) return c.json({ error: "Nothing to undo" }, 400);

  await db.delete(choreCompletions).where(eq(choreCompletions.id, last.id));
  await db
    .update(chores)
    .set({
      dueDate: last.forDate,
      archived: false,
      streak: Math.max(0, chore.streak - 1),
      // Completing a rotating chore hands it to the next person — undoing it
      // hands it back to whoever it was credited to.
      ...(chore.rotate ? { assignedTo: last.memberId } : {}),
    })
    .where(eq(chores.id, id));

  const updated = await db.query.chores.findFirst({ where: eq(chores.id, id) });
  return c.json({ chore: updated ? toChore(updated, false, null) : null });
});

export default app;
