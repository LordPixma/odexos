import { Hono } from "hono";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  allowanceLedger,
  families,
  merits,
  roomInspections,
  users,
} from "../db/schema";
import { generateId } from "../lib/crypto";
import { previousWeek, tallyFor, weekStartOf } from "../lib/allowance";
import { pushToUser } from "../lib/push";
import type { AppEnv } from "../lib/types";
import { badRequest, requireAmountCents, requireString } from "../lib/validate";
import {
  isParent,
  type Merit,
  type MeritBoard,
  type MeritHistory,
  type MeritWeek,
} from "@shared/types";

const app = new Hono<AppEnv>();

function toMerit(row: typeof merits.$inferSelect): Merit {
  return {
    id: row.id,
    childId: row.childId,
    value: row.value > 0 ? 1 : -1,
    note: row.note,
    weekStart: row.weekStart,
    issuedBy: row.issuedBy,
    createdAt: row.createdAt,
  };
}

/** Confirms the target is a child in this family. */
async function assertChild(
  db: AppEnv["Variables"]["db"],
  familyId: string,
  childId: string,
) {
  const child = await db.query.users.findFirst({
    where: and(eq(users.id, childId), eq(users.familyId, familyId)),
  });
  if (!child) badRequest("That child is not in this family");
  if (child!.role !== "child") badRequest("Merits are only for children");
  return child!;
}

/**
 * The week's board. Deliberately family-wide: the tallies are a shared
 * scoreboard everyone can see, unlike allowance balances which are private.
 */
app.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const weekStart = c.req.query("week") ?? weekStartOf();

  const children = await db.query.users.findMany({
    where: and(eq(users.familyId, familyId), eq(users.role, "child")),
    columns: { id: true },
  });

  const tallies = [];
  for (const child of children) {
    tallies.push({ childId: child.id, ...(await tallyFor(db, child.id, weekStart)) });
  }

  const recent = await db.query.merits.findMany({
    where: eq(merits.familyId, familyId),
    orderBy: [desc(merits.createdAt)],
    limit: 40,
  });

  const family = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });

  const board: MeritBoard = {
    weekStart,
    meritValueCents: family?.meritValueCents ?? 50,
    currency: family?.currency ?? "GBP",
    tallies: tallies.sort((a, b) => b.net - a.net),
    recent: recent.map(toMerit),
  };
  return c.json(board);
});

/** Everything issued to one child, newest first. */
app.get("/child/:childId", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const childId = c.req.param("childId");
  await assertChild(db, user.familyId, childId);

  const since = c.req.query("since");
  const rows = await db.query.merits.findMany({
    where: since
      ? and(eq(merits.childId, childId), gte(merits.weekStart, since))
      : eq(merits.childId, childId),
    orderBy: [desc(merits.createdAt)],
    limit: 200,
  });
  return c.json({ merits: rows.map(toMerit) });
});

/**
 * Week-by-week history for one child: the tallies, what each week settled at,
 * and the room inspection that went with it. Same privacy rule as the board —
 * merits are shared, so any family member can see them.
 */
app.get("/history/:childId", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const childId = c.req.param("childId");
  await assertChild(db, user.familyId, childId);

  const weeksBack = Math.min(
    52,
    Math.max(1, Number(c.req.query("weeks") ?? 12) || 12),
  );

  // The Mondays we care about, newest first.
  const mondays: string[] = [];
  let cursor = weekStartOf();
  for (let i = 0; i < weeksBack; i++) {
    mondays.push(cursor);
    cursor = previousWeek(cursor);
  }
  const oldest = mondays[mondays.length - 1];

  const entries = await db.query.merits.findMany({
    where: and(eq(merits.childId, childId), gte(merits.weekStart, oldest)),
    orderBy: [desc(merits.createdAt)],
    limit: 500,
  });
  const ledger = await db.query.allowanceLedger.findMany({
    where: and(
      eq(allowanceLedger.childId, childId),
      eq(allowanceLedger.kind, "weekly"),
      gte(allowanceLedger.weekStart, oldest),
    ),
  });
  const inspections = await db.query.roomInspections.findMany({
    where: and(
      eq(roomInspections.childId, childId),
      gte(roomInspections.weekStart, oldest),
    ),
  });

  const settledBy = new Map(ledger.map((l) => [l.weekStart, l.amountCents]));
  const inspectionBy = new Map(inspections.map((i) => [i.weekStart, i]));

  const family = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });

  const weeks: MeritWeek[] = mondays.map((weekStart) => {
    let up = 0;
    let down = 0;
    for (const e of entries) {
      if (e.weekStart !== weekStart) continue;
      if (e.value > 0) up += e.value;
      else down += -e.value;
    }
    const inspection = inspectionBy.get(weekStart);
    return {
      weekStart,
      merits: up,
      demerits: down,
      net: up - down,
      settledCents: settledBy.get(weekStart) ?? null,
      inspection: inspection
        ? { rating: inspection.rating, note: inspection.note }
        : null,
    };
  });

  const history: MeritHistory = {
    childId,
    currency: family?.currency ?? "GBP",
    meritValueCents: family?.meritValueCents ?? 50,
    weeks,
    entries: entries.map(toMerit),
  };
  return c.json(history);
});

/** Issue a merit (+1) or demerit (-1). Parents only, reason required. */
app.post("/", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  if (!isParent(user.role)) {
    return c.json({ error: "Only parents can issue merits" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const childId = requireString(body.childId, "Child");
  await assertChild(db, user.familyId, childId);

  const raw = Number(body.value);
  if (raw !== 1 && raw !== -1) badRequest("Value must be +1 or -1");
  // A merit without a reason is just a number — the note is the point.
  const note = requireString(body.note, "Reason", { max: 200 });

  const id = generateId();
  await db.insert(merits).values({
    id,
    familyId: user.familyId,
    childId,
    value: raw,
    note,
    weekStart: weekStartOf(),
    issuedBy: user.id,
  });

  // Tell the child. A merit they only discover on Sunday has lost most of its
  // point — and this is the notification a family actually wants.
  const family = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  const worth = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: family?.currency ?? "GBP",
  }).format((family?.meritValueCents ?? 50) / 100);
  c.executionCtx.waitUntil(
    pushToUser(db, c.env, childId, {
      title: raw > 0 ? `⭐ Merit — +${worth}` : `Demerit — −${worth}`,
      body: note,
      url: "/merits",
      tag: `merit:${id}`,
    }).then(() => undefined),
  );

  const created = await db.query.merits.findFirst({ where: eq(merits.id, id) });
  return c.json({ merit: created ? toMerit(created) : null }, 201);
});

/**
 * Remove one, for when it was issued in error. Parents only, and only within
 * the current week — once a week is settled the money has moved.
 */
app.delete("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  if (!isParent(user.role)) {
    return c.json({ error: "Only parents can remove merits" }, 403);
  }
  const row = await db.query.merits.findFirst({
    where: and(eq(merits.id, c.req.param("id")), eq(merits.familyId, user.familyId)),
  });
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.weekStart !== weekStartOf()) {
    return c.json(
      { error: "That week has already been settled — use an adjustment instead" },
      400,
    );
  }
  await db.delete(merits).where(eq(merits.id, row.id));
  return c.json({ ok: true });
});

/** What one merit is worth. Parents can change the rate. */
app.patch("/rate", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  if (!isParent(user.role)) {
    return c.json({ error: "Only parents can change the merit rate" }, 403);
  }
  const body = await c.req.json().catch(() => ({}));
  const value = requireAmountCents(body.meritValue, "Merit value");
  if (value < 0 || value > 100_00) {
    badRequest("A merit must be worth between 0 and 100.00");
  }
  await db
    .update(families)
    .set({ meritValueCents: value })
    .where(eq(families.id, user.familyId));
  return c.json({ meritValueCents: value });
});

export default app;
