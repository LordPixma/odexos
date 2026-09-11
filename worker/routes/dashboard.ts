import { Hono } from "hono";
import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import {
  accounts,
  activities,
  families,
  transactions,
  users,
} from "../db/schema";
import { toActivity, toMember, toTransaction } from "../lib/serialize";
import { expandActivities } from "../lib/recurrence";
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

  const budgetOverview = await buildBudgetsOverview(db, familyId, monthKey);

  const data: DashboardData = {
    family: { id: familyId, name: fam?.name ?? "" },
    members: memberRows.map(toMember),
    todayActivities,
    upcomingActivities,
    monthSpendCents,
    monthIncomeCents,
    currency,
    expenseByCategory,
    finance,
    budgetAlerts: budgetOverview.alerts,
    recentTransactions,
  };
  return c.json(data);
});

export default app;
