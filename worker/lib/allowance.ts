/**
 * The children's money: merits, the weekly settlement, and savings pots.
 *
 * The ledger is append-only and a balance is the sum of its rows. That is what
 * makes a bad week carry forward — a week with more demerits than merits posts
 * a negative line, and the running total simply stays short until it is earned
 * back. Nothing needs to "remember" a debt; it is just arithmetic.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import {
  allowanceLedger,
  balanceChecks,
  families,
  merits,
  savingsPots,
  users,
} from "../db/schema";
import { generateId } from "./crypto";
import type { Db } from "../db/client";
import type { Bindings } from "./types";
import { pushToFamily } from "./push";

/** Monday (UTC) of the week a date falls in, as YYYY-MM-DD. */
export function weekStartOf(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay: Sunday = 0, so shift Sunday back six days rather than forward one.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** The Monday before `weekStart`. */
export function previousWeek(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** Running balance for one child, in pence. Negative means they owe it back. */
export async function balanceFor(db: Db, childId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${allowanceLedger.amountCents}), 0)`,
    })
    .from(allowanceLedger)
    .where(eq(allowanceLedger.childId, childId));
  return Number(row?.total ?? 0);
}

/** Merits and demerits for one child in one week. */
export async function tallyFor(
  db: Db,
  childId: string,
  weekStart: string,
): Promise<{ merits: number; demerits: number; net: number }> {
  const rows = await db.query.merits.findMany({
    where: and(eq(merits.childId, childId), eq(merits.weekStart, weekStart)),
    columns: { value: true },
  });
  let up = 0;
  let down = 0;
  for (const r of rows) {
    if (r.value > 0) up += r.value;
    else down += -r.value;
  }
  return { merits: up, demerits: down, net: up - down };
}

/**
 * Posts one week's allowance line for every child, once. Returns how many were
 * settled. Safe to call repeatedly: the ledger's unique index on
 * (child, kind, weekStart) means a second attempt writes nothing.
 */
export async function settleWeek(
  db: Db,
  env: Bindings,
  familyId: string,
  weekStart: string,
): Promise<number> {
  const family = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });
  if (!family) return 0;

  const children = await db.query.users.findMany({
    where: and(eq(users.familyId, familyId), eq(users.role, "child")),
  });

  // The Sunday that closes this week, for the joined-too-late check below.
  const weekEnd = new Date(`${weekStart}T00:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndYmd = weekEnd.toISOString().slice(0, 10);

  let settled = 0;
  for (const child of children) {
    // Never back-pay a week that was already over before they joined — the
    // first settlement after setting up shouldn't hand out a free week.
    if (child.createdAt.slice(0, 10) > weekEndYmd) continue;

    const tally = await tallyFor(db, child.id, weekStart);
    const meritCents = tally.net * family.meritValueCents;
    const amount = child.allowanceCents + meritCents;

    // Nothing to record for a child with no allowance and no merits either way.
    if (amount === 0 && tally.merits === 0 && tally.demerits === 0) continue;

    try {
      await db.insert(allowanceLedger).values({
        id: generateId(),
        familyId,
        childId: child.id,
        kind: "weekly",
        amountCents: amount,
        weekStart,
        baseCents: child.allowanceCents,
        meritCount: tally.merits,
        demeritCount: tally.demerits,
        note: null,
      });
      settled++;
    } catch {
      // Unique index tripped — this week is already posted for this child.
      continue;
    }
  }

  if (settled > 0) {
    await db
      .update(families)
      .set({ lastAllowanceWeek: weekStart })
      .where(eq(families.id, familyId));
    await pushToFamily(
      db,
      env,
      familyId,
      {
        title: "Allowance settled",
        body: "Last week's merits have been added up. Time to check the balance.",
        url: "/allowance",
        tag: `allowance:${weekStart}`,
      },
      "digest",
    );
  }
  return settled;
}

/**
 * Settles the week that just ended, unless it already has been. Called from the
 * Monday cron, so the line lands once the week is actually complete.
 */
export async function settleLastWeek(
  db: Db,
  env: Bindings,
  familyId: string,
  force = false,
): Promise<number> {
  const target = previousWeek(weekStartOf());
  const family = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });
  if (!family) return 0;
  if (!force && family.lastAllowanceWeek === target) return 0;
  return settleWeek(db, env, familyId, target);
}

/** Latest self-reported bank balance for a child, if there is one. */
export async function latestBalanceCheck(db: Db, childId: string) {
  return db.query.balanceChecks.findFirst({
    where: eq(balanceChecks.childId, childId),
    orderBy: [desc(balanceChecks.weekStart)],
  });
}

/** Sum of a child's savings pots. */
export async function potsTotalFor(db: Db, childId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${savingsPots.balanceCents}), 0)`,
    })
    .from(savingsPots)
    .where(eq(savingsPots.childId, childId));
  return Number(row?.total ?? 0);
}

/**
 * Nudges children who haven't reported this week's bank balance yet. Returns
 * how many were prompted.
 */
export async function promptBalanceUpdates(
  db: Db,
  env: Bindings,
  familyId: string,
): Promise<number> {
  const thisWeek = weekStartOf();
  const children = await db.query.users.findMany({
    where: and(
      eq(users.familyId, familyId),
      eq(users.role, "child"),
      eq(users.status, "active"),
    ),
    columns: { id: true },
  });

  let due = 0;
  for (const child of children) {
    const latest = await latestBalanceCheck(db, child.id);
    if (latest?.weekStart === thisWeek) continue;
    due++;
  }
  if (due === 0) return 0;

  await pushToFamily(
    db,
    env,
    familyId,
    {
      title: "Time to update your balance",
      body: "Pop your bank balance and savings pots into OdexOS for this week.",
      url: "/allowance",
      tag: `balance-check:${thisWeek}`,
    },
    "digest",
  );
  return due;
}
