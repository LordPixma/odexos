import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../db/client";
import { budgets, expenses, families, transactions } from "../db/schema";
import type { BudgetRow } from "../db/schema";
import {
  BUDGET_WARNING_THRESHOLD,
  type BudgetProgress,
  type BudgetStatus,
  type BudgetsOverview,
  type ExpenseCategory,
} from "@shared/types";

export function monthBounds(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-31` };
}

export function currentMonthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

interface Spend {
  byCategory: Map<ExpenseCategory, number>;
  totalCents: number;
}

/**
 * Combined monthly spend by category = manual expenses + synced bank
 * transaction debits. (A family typically uses one primary source; when both
 * are used the two are additive.)
 */
export async function computeSpendByCategory(
  db: Db,
  familyId: string,
  month: string,
): Promise<Spend> {
  const { start, end } = monthBounds(month);
  const byCategory = new Map<ExpenseCategory, number>();
  let totalCents = 0;

  const add = (category: ExpenseCategory, cents: number) => {
    byCategory.set(category, (byCategory.get(category) ?? 0) + cents);
    totalCents += cents;
  };

  const expenseRows = await db.query.expenses.findMany({
    where: and(
      eq(expenses.familyId, familyId),
      gte(expenses.spentAt, start),
      lte(expenses.spentAt, end),
    ),
  });
  for (const e of expenseRows) add(e.category, e.amountCents);

  const txnRows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.familyId, familyId),
      eq(transactions.direction, "debit"),
      gte(transactions.date, start),
      lte(transactions.date, end),
    ),
  });
  for (const t of txnRows) add(t.category, Math.abs(t.amountCents));

  return { byCategory, totalCents };
}

export function statusFor(percent: number): BudgetStatus {
  if (percent >= 1) return "over";
  if (percent >= BUDGET_WARNING_THRESHOLD) return "warning";
  return "ok";
}

export function buildProgress(budget: BudgetRow, spentCents: number): BudgetProgress {
  const percent = budget.amountCents > 0 ? spentCents / budget.amountCents : 0;
  return {
    id: budget.id,
    category: budget.category,
    amountCents: budget.amountCents,
    spentCents,
    remainingCents: budget.amountCents - spentCents,
    percent,
    status: statusFor(percent),
  };
}

/** Full budgets-vs-spend picture for a family in a given month. */
export async function buildBudgetsOverview(
  db: Db,
  familyId: string,
  month: string,
): Promise<BudgetsOverview> {
  const fam = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });
  const rows = await db.query.budgets.findMany({
    where: eq(budgets.familyId, familyId),
  });
  const spend = await computeSpendByCategory(db, familyId, month);

  let overall: BudgetProgress | null = null;
  const categories: BudgetProgress[] = [];
  for (const b of rows) {
    if (b.category === null) {
      overall = buildProgress(b, spend.totalCents);
    } else {
      categories.push(buildProgress(b, spend.byCategory.get(b.category) ?? 0));
    }
  }
  categories.sort((a, b) => b.percent - a.percent);

  const alerts = [...(overall ? [overall] : []), ...categories]
    .filter((p) => p.status !== "ok")
    .sort((a, b) => b.percent - a.percent);

  return {
    month,
    currency: fam?.currency ?? "GBP",
    overall,
    categories,
    alerts,
  };
}
