import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq } from "drizzle-orm";
import {
  allowanceLedger,
  balanceChecks,
  families,
  savingsPots,
  users,
} from "../db/schema";
import { generateId } from "../lib/crypto";
import {
  balanceFor,
  latestBalanceCheck,
  potsTotalFor,
  tallyFor,
  weekStartOf,
} from "../lib/allowance";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalString,
  requireAmountCents,
  requireString,
} from "../lib/validate";
import {
  MAX_SAVINGS_POTS,
  isParent,
  type AllowanceOverview,
  type LedgerEntry,
  type SavingsPot,
} from "@shared/types";

const app = new Hono<AppEnv>();

/**
 * Money is private: a child sees only their own, parents see everyone's.
 * Siblings can compare merits on the board, but not balances.
 */
async function authorizeChild(c: Context<AppEnv>, childId: string) {
  const db = c.get("db");
  const user = c.get("user");
  if (!isParent(user.role) && user.id !== childId) {
    return null;
  }
  const child = await db.query.users.findFirst({
    where: and(eq(users.id, childId), eq(users.familyId, user.familyId)),
  });
  return child ?? null;
}

function toPot(row: typeof savingsPots.$inferSelect): SavingsPot {
  return {
    id: row.id,
    childId: row.childId,
    name: row.name,
    balanceCents: row.balanceCents,
    targetCents: row.targetCents,
    color: row.color,
    updatedAt: row.updatedAt,
  };
}

function toEntry(row: typeof allowanceLedger.$inferSelect): LedgerEntry {
  return {
    id: row.id,
    kind: row.kind,
    amountCents: row.amountCents,
    weekStart: row.weekStart,
    baseCents: row.baseCents,
    meritCount: row.meritCount,
    demeritCount: row.demeritCount,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/** Everything one child's allowance page needs. */
app.get("/:childId", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const childId = c.req.param("childId");

  const child = await authorizeChild(c, childId);
  if (!child) return c.json({ error: "Not found" }, 404);

  const family = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  const weekStart = weekStartOf();
  const tally = await tallyFor(db, childId, weekStart);
  const meritValueCents = family?.meritValueCents ?? 50;
  const meritCents = tally.net * meritValueCents;

  const ledger = await db.query.allowanceLedger.findMany({
    where: eq(allowanceLedger.childId, childId),
    orderBy: [desc(allowanceLedger.createdAt)],
    limit: 50,
  });
  const pots = await db.query.savingsPots.findMany({
    where: eq(savingsPots.childId, childId),
    orderBy: [desc(savingsPots.createdAt)],
  });
  const latest = await latestBalanceCheck(db, childId);

  const overview: AllowanceOverview = {
    child: {
      id: child.id,
      name: child.name,
      nickname: child.nickname,
      color: child.color,
      avatarVersion: child.avatarVersion,
    },
    currency: family?.currency ?? "GBP",
    allowanceCents: child.allowanceCents,
    meritValueCents,
    balanceCents: await balanceFor(db, childId),
    thisWeek: {
      weekStart,
      merits: tally.merits,
      demerits: tally.demerits,
      meritCents,
      projectedCents: child.allowanceCents + meritCents,
    },
    ledger: ledger.map(toEntry),
    pots: pots.map(toPot),
    potsTotalCents: await potsTotalFor(db, childId),
    bankBalanceCents: latest?.balanceCents ?? null,
    bankUpdatedAt: latest?.createdAt ?? null,
    needsBalanceUpdate: latest?.weekStart !== weekStart,
  };
  return c.json(overview);
});

/** Record a payout — a parent handing over the cash. */
app.post("/:childId/payout", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  if (!isParent(user.role)) {
    return c.json({ error: "Only parents can record a payout" }, 403);
  }
  const childId = c.req.param("childId");
  const child = await authorizeChild(c, childId);
  if (!child) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const amount = requireAmountCents(body.amount, "Amount");
  if (amount <= 0) badRequest("A payout must be more than zero");

  // A payout can only hand over what is actually owed. Handing over more would
  // push the child into a debt they never incurred and leave "balance" meaning
  // nothing — give extra as an adjustment instead, where it needs a reason.
  const balance = await balanceFor(db, childId);
  if (amount > balance) {
    badRequest(
      balance <= 0
        ? "There's nothing to pay out — use an adjustment to give extra"
        : "That's more than what's owed — use an adjustment to give extra",
    );
  }

  await db.insert(allowanceLedger).values({
    id: generateId(),
    familyId: user.familyId,
    childId,
    kind: "payout",
    amountCents: -amount, // money leaving the ledger and entering their pocket
    note: optionalString(body.note, "Note", { max: 200 }),
    createdBy: user.id,
  });
  return c.json({ balanceCents: await balanceFor(db, childId) }, 201);
});

/** A manual correction, in either direction. */
app.post("/:childId/adjust", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  if (!isParent(user.role)) {
    return c.json({ error: "Only parents can make an adjustment" }, 403);
  }
  const childId = c.req.param("childId");
  const child = await authorizeChild(c, childId);
  if (!child) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  // Pounds in, pence stored — negative is allowed here, that is the point.
  const amount = requireAmountCents(body.amount, "Amount");
  if (amount === 0) badRequest("An adjustment needs a non-zero amount");
  const note = requireString(body.note, "Reason", { max: 200 });

  await db.insert(allowanceLedger).values({
    id: generateId(),
    familyId: user.familyId,
    childId,
    kind: "adjustment",
    amountCents: amount,
    note,
    createdBy: user.id,
  });
  return c.json({ balanceCents: await balanceFor(db, childId) }, 201);
});

// --- Self-reported bank balance ---

/**
 * One reading per week, replaceable — a child correcting a typo shouldn't
 * create a second row for the same week.
 */
app.post("/:childId/balance", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const childId = c.req.param("childId");
  const child = await authorizeChild(c, childId);
  if (!child) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const balanceCents = requireAmountCents(body.balance, "Balance");
  if (balanceCents < 0) badRequest("A balance cannot be negative");
  const weekStart = weekStartOf();

  const existing = await db.query.balanceChecks.findFirst({
    where: and(
      eq(balanceChecks.childId, childId),
      eq(balanceChecks.weekStart, weekStart),
    ),
  });
  const note = optionalString(body.note, "Note", { max: 200 });

  if (existing) {
    await db
      .update(balanceChecks)
      .set({ balanceCents, note, recordedBy: user.id })
      .where(eq(balanceChecks.id, existing.id));
  } else {
    await db.insert(balanceChecks).values({
      id: generateId(),
      familyId: user.familyId,
      childId,
      weekStart,
      balanceCents,
      note,
      recordedBy: user.id,
    });
  }
  return c.json({ balanceCents, weekStart });
});

/** Reported balances over time, newest first. */
app.get("/:childId/balance/history", async (c) => {
  const db = c.get("db");
  const childId = c.req.param("childId");
  const child = await authorizeChild(c, childId);
  if (!child) return c.json({ error: "Not found" }, 404);

  const rows = await db.query.balanceChecks.findMany({
    where: eq(balanceChecks.childId, childId),
    orderBy: [desc(balanceChecks.weekStart)],
    limit: 26,
  });
  return c.json({
    history: rows.map((r) => ({
      id: r.id,
      weekStart: r.weekStart,
      balanceCents: r.balanceCents,
      note: r.note,
      createdAt: r.createdAt,
    })),
  });
});

// --- Savings pots ---

app.post("/:childId/pots", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const childId = c.req.param("childId");
  const child = await authorizeChild(c, childId);
  if (!child) return c.json({ error: "Not found" }, 404);

  const existing = await db.query.savingsPots.findMany({
    where: eq(savingsPots.childId, childId),
    columns: { id: true },
  });
  if (existing.length >= MAX_SAVINGS_POTS) {
    return c.json(
      { error: `That's the limit of ${MAX_SAVINGS_POTS} pots — rename or delete one first` },
      400,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const id = generateId();
  await db.insert(savingsPots).values({
    id,
    familyId: user.familyId,
    childId,
    name: requireString(body.name, "Name", { max: 60 }),
    balanceCents:
      body.balance === undefined ? 0 : requireAmountCents(body.balance, "Balance"),
    targetCents:
      body.target === undefined || body.target === null || body.target === ""
        ? null
        : requireAmountCents(body.target, "Target"),
    color: optionalString(body.color, "Colour", { max: 20 }) ?? child.color,
  });
  const created = await db.query.savingsPots.findFirst({
    where: eq(savingsPots.id, id),
  });
  return c.json({ pot: created ? toPot(created) : null }, 201);
});

app.patch("/:childId/pots/:potId", async (c) => {
  const db = c.get("db");
  const childId = c.req.param("childId");
  const child = await authorizeChild(c, childId);
  if (!child) return c.json({ error: "Not found" }, 404);

  const pot = await db.query.savingsPots.findFirst({
    where: and(
      eq(savingsPots.id, c.req.param("potId")),
      eq(savingsPots.childId, childId),
    ),
  });
  if (!pot) return c.json({ error: "Pot not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof savingsPots.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (body.name !== undefined)
    updates.name = requireString(body.name, "Name", { max: 60 });
  if (body.balance !== undefined)
    updates.balanceCents = requireAmountCents(body.balance, "Balance");
  if (body.target !== undefined) {
    updates.targetCents =
      body.target === null || body.target === ""
        ? null
        : requireAmountCents(body.target, "Target");
  }
  if (body.color !== undefined)
    updates.color = optionalString(body.color, "Colour", { max: 20 }) ?? pot.color;

  await db.update(savingsPots).set(updates).where(eq(savingsPots.id, pot.id));
  const updated = await db.query.savingsPots.findFirst({
    where: eq(savingsPots.id, pot.id),
  });
  return c.json({ pot: updated ? toPot(updated) : null });
});

app.delete("/:childId/pots/:potId", async (c) => {
  const db = c.get("db");
  const childId = c.req.param("childId");
  const child = await authorizeChild(c, childId);
  if (!child) return c.json({ error: "Not found" }, 404);

  const pot = await db.query.savingsPots.findFirst({
    where: and(
      eq(savingsPots.id, c.req.param("potId")),
      eq(savingsPots.childId, childId),
    ),
  });
  if (!pot) return c.json({ error: "Pot not found" }, 404);
  await db.delete(savingsPots).where(eq(savingsPots.id, pot.id));
  return c.json({ ok: true });
});

export default app;
