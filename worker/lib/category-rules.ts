import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { categoryRules, transactions } from "../db/schema";
import { categorize, type CustomRule } from "./bank/categorize";

/** Family rules, highest priority first (ties broken by creation order). */
export async function loadFamilyRules(
  db: Db,
  familyId: string,
): Promise<CustomRule[]> {
  const rows = await db.query.categoryRules.findMany({
    where: eq(categoryRules.familyId, familyId),
    orderBy: [desc(categoryRules.priority), asc(categoryRules.createdAt)],
  });
  return rows.map((r) => ({ pattern: r.pattern, category: r.category }));
}

/**
 * Re-categorise every non-locked transaction for a family using the current
 * rules (family rules + built-in). Manually-overridden (locked) transactions
 * are left untouched. Returns how many rows changed.
 */
export async function reapplyRules(db: Db, familyId: string): Promise<number> {
  const rules = await loadFamilyRules(db, familyId);
  const rows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.familyId, familyId),
      eq(transactions.categoryLocked, false),
    ),
  });

  let updated = 0;
  for (const row of rows) {
    const next = categorize(row, rules);
    if (next !== row.category) {
      await db
        .update(transactions)
        .set({ category: next })
        .where(eq(transactions.id, row.id));
      updated++;
    }
  }
  return updated;
}
