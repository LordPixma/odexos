import { Hono } from "hono";
import { and, desc, eq, lte } from "drizzle-orm";
import {
  choreCompletions,
  chores,
  families,
  roomInspections,
  users,
} from "../db/schema";
import { generateId } from "../lib/crypto";
import {
  balanceFor,
  latestBalanceCheck,
  potsTotalFor,
  settleLastWeek,
  tallyFor,
  weekStartOf,
} from "../lib/allowance";
import type { AppEnv } from "../lib/types";
import { badRequest, optionalString, requireString } from "../lib/validate";
import { pushToUser } from "../lib/push";
import {
  isParent,
  type ChildSummary,
  type ParentCentre,
  type RoomInspection,
} from "@shared/types";

const app = new Hono<AppEnv>();

/** Everything below is for parents only. */
app.use("*", async (c, next) => {
  if (!isParent(c.get("user").role)) {
    return c.json({ error: "The Parent Centre is for parents only" }, 403);
  }
  return next();
});

function toInspection(row: typeof roomInspections.$inferSelect): RoomInspection {
  return {
    id: row.id,
    childId: row.childId,
    weekStart: row.weekStart,
    rating: row.rating,
    note: row.note,
    createdAt: row.createdAt,
  };
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** One card per child: merits, money, room, chores. */
app.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const weekStart = weekStartOf();

  const family = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });
  const children = await db.query.users.findMany({
    where: and(eq(users.familyId, familyId), eq(users.role, "child")),
  });

  const today = todayYmd();
  const summaries: ChildSummary[] = [];
  for (const child of children) {
    const tally = await tallyFor(db, child.id, weekStart);
    const inspection = await db.query.roomInspections.findFirst({
      where: and(
        eq(roomInspections.childId, child.id),
        eq(roomInspections.weekStart, weekStart),
      ),
    });

    // Chores assigned to this child that are overdue or due today and not
    // already ticked off.
    const due = await db.query.chores.findMany({
      where: and(
        eq(chores.familyId, familyId),
        eq(chores.assignedTo, child.id),
        eq(chores.archived, false),
        lte(chores.dueDate, today),
      ),
      columns: { id: true },
    });
    const doneRows = await db.query.choreCompletions.findMany({
      where: and(
        eq(choreCompletions.familyId, familyId),
        eq(choreCompletions.memberId, child.id),
        eq(choreCompletions.forDate, today),
      ),
      columns: { choreId: true },
    });
    const done = new Set(doneRows.map((r) => r.choreId));

    const latest = await latestBalanceCheck(db, child.id);
    summaries.push({
      id: child.id,
      name: child.name,
      nickname: child.nickname,
      color: child.color,
      avatarVersion: child.avatarVersion,
      allowanceCents: child.allowanceCents,
      balanceCents: await balanceFor(db, child.id),
      thisWeek: tally,
      inspection: inspection ? toInspection(inspection) : null,
      choresOpen: due.filter((ch) => !done.has(ch.id)).length,
      potsTotalCents: await potsTotalFor(db, child.id),
      bankBalanceCents: latest?.balanceCents ?? null,
      needsBalanceUpdate: latest?.weekStart !== weekStart,
    });
  }

  const centre: ParentCentre = {
    weekStart,
    currency: family?.currency ?? "GBP",
    meritValueCents: family?.meritValueCents ?? 50,
    children: summaries,
  };
  return c.json(centre);
});

// --- Room inspections ---

/**
 * Record this week's inspection. One per child per week, so re-recording
 * corrects the existing result rather than stacking another.
 */
app.post("/inspections", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const childId = requireString(body.childId, "Child");
  const child = await db.query.users.findFirst({
    where: and(eq(users.id, childId), eq(users.familyId, user.familyId)),
  });
  if (!child || child.role !== "child") badRequest("That child is not in this family");

  const rating = Math.round(Number(body.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    badRequest("Rating must be between 1 and 5");
  }
  const note = optionalString(body.note, "Note", { max: 300 });
  const weekStart = optionalString(body.weekStart, "Week") ?? weekStartOf();

  const existing = await db.query.roomInspections.findFirst({
    where: and(
      eq(roomInspections.childId, childId),
      eq(roomInspections.weekStart, weekStart),
    ),
  });

  if (existing) {
    await db
      .update(roomInspections)
      .set({ rating, note, inspectedBy: user.id })
      .where(eq(roomInspections.id, existing.id));
    const updated = await db.query.roomInspections.findFirst({
      where: eq(roomInspections.id, existing.id),
    });
    return c.json({ inspection: updated ? toInspection(updated) : null });
  }

  const id = generateId();
  await db.insert(roomInspections).values({
    id,
    familyId: user.familyId,
    childId,
    weekStart,
    rating,
    note,
    inspectedBy: user.id,
  });
  c.executionCtx.waitUntil(
    pushToUser(db, c.env, childId, {
      title: `Room inspection: ${rating}/5`,
      body: note ?? "This week's result is in.",
      url: "/merits",
      tag: `inspection:${weekStart}`,
    }).then(() => undefined),
  );

  const created = await db.query.roomInspections.findFirst({
    where: eq(roomInspections.id, id),
  });
  return c.json({ inspection: created ? toInspection(created) : null }, 201);
});

/** Inspection history for one child. */
app.get("/inspections/:childId", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const childId = c.req.param("childId");
  const rows = await db.query.roomInspections.findMany({
    where: and(
      eq(roomInspections.childId, childId),
      eq(roomInspections.familyId, user.familyId),
    ),
    orderBy: [desc(roomInspections.weekStart)],
    limit: 26,
  });
  return c.json({ inspections: rows.map(toInspection) });
});

/**
 * Settle last week by hand. The Monday cron does this automatically; this is
 * for catching up after a missed run.
 */
app.post("/settle", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const force = c.req.query("force") === "1";
  const settled = await settleLastWeek(db, c.env, user.familyId, force);
  return c.json({ settled });
});

export default app;
