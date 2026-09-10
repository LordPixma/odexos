import { Hono } from "hono";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { activities, expenses, families, users } from "../db/schema";
import { toActivity, toMember } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import {
  ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  type AccountType,
  type DashboardData,
  type ExpenseCategory,
  type FinanceSummary,
} from "@shared/types";
import { accounts } from "../db/schema";

const app = new Hono<AppEnv>();

function startOfMonthUTC(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function endOfMonthUTC(now: Date): string {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

app.get("/", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const familyId = user.familyId;
  const now = new Date();

  const fam = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });
  const currency = fam?.currency ?? "GBP";

  const memberRows = await db.query.users.findMany({
    where: eq(users.familyId, familyId),
    orderBy: [asc(users.createdAt)],
  });

  // Activities: today + the next 7 days.
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(todayStart.getTime() + 8 * 24 * 60 * 60 * 1000);

  const upcomingRows = await db.query.activities.findMany({
    where: and(
      eq(activities.familyId, familyId),
      gte(activities.startsAt, todayStart.toISOString()),
      lte(activities.startsAt, weekEnd.toISOString()),
    ),
    orderBy: [asc(activities.startsAt)],
    limit: 100,
  });
  const todayActivities = upcomingRows
    .filter((a) => a.startsAt < todayEnd.toISOString())
    .map(toActivity);
  const upcomingActivities = upcomingRows
    .filter((a) => a.startsAt >= todayEnd.toISOString())
    .map(toActivity);

  // Expenses: current month total + breakdown by category.
  const monthStart = startOfMonthUTC(now);
  const monthEnd = endOfMonthUTC(now);
  const monthExpenses = await db.query.expenses.findMany({
    where: and(
      eq(expenses.familyId, familyId),
      gte(expenses.spentAt, monthStart),
      lte(expenses.spentAt, monthEnd),
    ),
  });
  let monthSpendCents = 0;
  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of monthExpenses) {
    monthSpendCents += e.amountCents;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
  }
  const expenseByCategory = [...byCategory.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  // Finance summary.
  const accountRows = await db.query.accounts.findMany({
    where: eq(accounts.familyId, familyId),
  });
  const liabilityTypes = new Set<AccountType>(LIABILITY_ACCOUNT_TYPES);
  const byTypeMap = new Map<AccountType, number>();
  for (const t of ACCOUNT_TYPES) byTypeMap.set(t, 0);
  let assets = 0;
  let liabilities = 0;
  for (const a of accountRows) {
    byTypeMap.set(a.type, (byTypeMap.get(a.type) ?? 0) + a.balanceCents);
    if (liabilityTypes.has(a.type)) liabilities += a.balanceCents;
    else assets += a.balanceCents;
  }
  const finance: FinanceSummary = {
    currency,
    totalAssetsCents: assets,
    totalLiabilitiesCents: liabilities,
    netWorthCents: assets - liabilities,
    accountCount: accountRows.length,
    byType: [...byTypeMap.entries()]
      .filter(([, bal]) => bal !== 0)
      .map(([type, balanceCents]) => ({ type, balanceCents })),
  };

  const data: DashboardData = {
    family: { id: familyId, name: fam?.name ?? "" },
    members: memberRows.map(toMember),
    todayActivities,
    upcomingActivities,
    monthSpendCents,
    currency,
    expenseByCategory,
    finance,
  };
  return c.json(data);
});

export default app;
