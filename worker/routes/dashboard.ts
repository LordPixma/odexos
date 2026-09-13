import { Hono } from "hono";
import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import {
  accounts,
  activities,
  choreCompletions,
  chores,
  expenses,
  families,
  transactions,
  users,
} from "../db/schema";
import {
  toActivity,
  toExpense,
  toMember,
  toTransaction,
} from "../lib/serialize";
import { expandActivities } from "../lib/recurrence";
import { upcomingBirthdays } from "../lib/birthdays";
import { isChild } from "../lib/access";
import {
  buildBudgetsOverview,
  computeSpendByCategory,
  currentMonthKey,
} from "../lib/budgets";
import type { AppEnv } from "../lib/types";
import {
  ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  type AccountType,
  type ChildDashboardData,
  type DashboardData,
  type FinanceSummary,
} from "@shared/types";

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

  // Non-recurring in-window + every recurring series, then expand.
  const nonRecurringRows = await db.query.activities.findMany({
    where: and(
      eq(activities.familyId, familyId),
      eq(activities.recurrence, "none"),
      gte(activities.startsAt, todayStart.toISOString()),
      lte(activities.startsAt, weekEnd.toISOString()),
    ),
    limit: 200,
  });
  const recurringRows = await db.query.activities.findMany({
    where: and(eq(activities.familyId, familyId), ne(activities.recurrence, "none")),
    limit: 200,
  });
  const windowActivities = expandActivities(
    [...nonRecurringRows, ...recurringRows].map(toActivity),
    todayStart,
    weekEnd,
  );
  const todayEndISO = todayEnd.toISOString();
  const todayActivities = windowActivities.filter((a) => a.startsAt < todayEndISO);
  const upcomingActivities = windowActivities.filter(
    (a) => a.startsAt >= todayEndISO,
  );

  // Combined monthly spend (manual expenses + synced bank debits) by category.
  const monthKey = currentMonthKey(now);
  const spend = await computeSpendByCategory(db, familyId, monthKey);
  const monthSpendCents = spend.totalCents;
  const expenseByCategory = [...spend.byCategory.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  // Income + recent activity from synced transactions.
  const monthStart = startOfMonthUTC(now);
  const monthEnd = endOfMonthUTC(now);
  const monthCredits = await db.query.transactions.findMany({
    where: and(
      eq(transactions.familyId, familyId),
      eq(transactions.direction, "credit"),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
    ),
  });
  const monthIncomeCents = monthCredits.reduce((s, t) => s + t.amountCents, 0);

  const recentTxnRows = await db.query.transactions.findMany({
    where: eq(transactions.familyId, familyId),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit: 5,
  });
  const recentTransactions = recentTxnRows.map(toTransaction);

  const recentExpenseRows = await db.query.expenses.findMany({
    where: eq(expenses.familyId, familyId),
    orderBy: [desc(expenses.spentAt), desc(expenses.createdAt)],
    limit: 6,
  });
  const recentExpenses = recentExpenseRows.map(toExpense);

  // 14-day daily trend: combined spend (manual expenses + bank debits) and
  // income (bank credits), bucketed by day.
  const TREND_DAYS = 14;
  const trendStartMs = todayStart.getTime() - (TREND_DAYS - 1) * 86400000;
  const trendStartYmd = new Date(trendStartMs).toISOString().slice(0, 10);
  const todayYmd = new Date(todayStart.getTime()).toISOString().slice(0, 10);

  const trendExpenses = await db.query.expenses.findMany({
    where: and(
      eq(expenses.familyId, familyId),
      gte(expenses.spentAt, trendStartYmd),
      lte(expenses.spentAt, todayYmd),
    ),
  });
  const trendTxns = await db.query.transactions.findMany({
    where: and(
      eq(transactions.familyId, familyId),
      gte(transactions.date, trendStartYmd),
      lte(transactions.date, todayYmd),
    ),
  });
  const spendBucket = new Map<string, number>();
  const incomeBucket = new Map<string, number>();
  for (let i = 0; i < TREND_DAYS; i++) {
    const d = new Date(trendStartMs + i * 86400000).toISOString().slice(0, 10);
    spendBucket.set(d, 0);
    incomeBucket.set(d, 0);
  }
  for (const e of trendExpenses) {
    spendBucket.set(e.spentAt, (spendBucket.get(e.spentAt) ?? 0) + e.amountCents);
  }
  for (const t of trendTxns) {
    if (t.direction === "credit") {
      incomeBucket.set(t.date, (incomeBucket.get(t.date) ?? 0) + Math.abs(t.amountCents));
    } else {
      spendBucket.set(t.date, (spendBucket.get(t.date) ?? 0) + Math.abs(t.amountCents));
    }
  }
  const spendTrend = [...spendBucket.keys()].sort().map((date) => ({
    date,
    spendCents: spendBucket.get(date) ?? 0,
    incomeCents: incomeBucket.get(date) ?? 0,
  }));

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

  // Chores overdue or due today (completing one rolls its due date forward).
  // A daily chore that was overdue rolls onto today, so anything already ticked
  // off today is dropped — otherwise this count outruns the Chores page.
  const dueChores = await db.query.chores.findMany({
    where: and(
      eq(chores.familyId, familyId),
      eq(chores.archived, false),
      lte(chores.dueDate, todayYmd),
    ),
    columns: { id: true },
  });
  const doneTodayRows = await db.query.choreCompletions.findMany({
    where: and(
      eq(choreCompletions.familyId, familyId),
      gte(choreCompletions.completedAt, todayYmd),
    ),
    columns: { choreId: true },
  });
  const doneToday = new Set(doneTodayRows.map((r) => r.choreId));
  const openChores = dueChores.filter((ch) => !doneToday.has(ch.id));

  const budgetOverview = await buildBudgetsOverview(db, familyId, monthKey);

  const shared = {
    family: { id: familyId, name: fam?.name ?? "" },
    members: memberRows.map(toMember),
    todayActivities,
    upcomingActivities,
    currency,
    upcomingBirthdays: upcomingBirthdays(memberRows, now).slice(0, 4),
    choresOpen: openChores.length,
  };

  // A child's dashboard carries none of the family's money — not zeroed out,
  // absent. Hiding the cards but shipping the numbers would still put the
  // household's finances one devtools tab away.
  if (isChild(user.role)) {
    const data: ChildDashboardData = { ...shared, kind: "child" };
    return c.json(data);
  }

  const data: DashboardData = {
    ...shared,
    kind: "adult",
    monthSpendCents,
    monthIncomeCents,
    expenseByCategory,
    finance,
    budgetAlerts: budgetOverview.alerts,
    budgets: budgetOverview.categories,
    recentTransactions,
    recentExpenses,
    spendTrend,
  };
  return c.json(data);
});

export default app;
