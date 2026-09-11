import { Hono, type Context } from "hono";
import { and, asc, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import {
  accounts,
  bankConnections,
  bankOauthStates,
  budgets,
  categoryRules,
  families,
  transactions,
  users,
} from "../db/schema";
import { generateId, generateToken } from "../lib/crypto";
import {
  toAccount,
  toBankConnection,
  toBudget,
  toCategoryRule,
  toTransaction,
} from "../lib/serialize";
import { buildBudgetsOverview, currentMonthKey } from "../lib/budgets";
import { reapplyRules } from "../lib/category-rules";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalString,
  requireAmountCents,
  requireEnum,
  requireString,
} from "../lib/validate";
import {
  completeConnection,
  getProvider,
  hasTrueLayerCredentials,
  redirectUri,
  syncConnection,
} from "../lib/bank";
import {
  ACCOUNT_TYPES,
  EXPENSE_CATEGORIES,
  LIABILITY_ACCOUNT_TYPES,
  type AccountType,
  type ApplyRulesResult,
  type BudgetsOverview,
  type ExpenseCategory,
  type FinanceSummary,
  type SpendingInsights,
  type SyncResult,
} from "@shared/types";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

const app = new Hono<AppEnv>();

async function assertOwnerMember(
  db: AppEnv["Variables"]["db"],
  familyId: string,
  memberId: string | null,
): Promise<string | null> {
  if (!memberId) return null;
  const member = await db.query.users.findFirst({
    where: and(eq(users.id, memberId), eq(users.familyId, familyId)),
  });
  if (!member) badRequest("Account owner is not part of this family");
  return memberId;
}

app.get("/accounts", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const rows = await db.query.accounts.findMany({
    where: eq(accounts.familyId, familyId),
    orderBy: [asc(accounts.type), asc(accounts.name)],
  });
  return c.json({ accounts: rows.map(toAccount) });
});

app.post("/accounts", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const name = requireString(body.name, "Account name", { max: 120 });
  const type = requireEnum(body.type, ACCOUNT_TYPES, "Type");
  const balanceCents = requireAmountCents(body.balance ?? 0, "Balance");
  const fam = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  const currency =
    optionalString(body.currency, "Currency", { max: 3 }) ?? fam?.currency ?? "GBP";
  const ownerMemberId = await assertOwnerMember(
    db,
    user.familyId,
    optionalString(body.ownerMemberId, "Owner"),
  );

  const id = generateId();
  await db.insert(accounts).values({
    id,
    familyId: user.familyId,
    name,
    institution: optionalString(body.institution, "Institution", { max: 120 }),
    type,
    balanceCents,
    currency,
    provider: "manual",
    ownerMemberId,
    lastSyncedAt: new Date().toISOString(),
  });
  const created = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
  });
  return c.json({ account: created ? toAccount(created) : null }, 201);
});

app.patch("/accounts/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Account not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (body.name !== undefined)
    updates.name = requireString(body.name, "Account name", { max: 120 });
  if (body.institution !== undefined)
    updates.institution = optionalString(body.institution, "Institution", { max: 120 });
  if (body.type !== undefined)
    updates.type = requireEnum(body.type, ACCOUNT_TYPES, "Type");
  if (body.balance !== undefined) {
    updates.balanceCents = requireAmountCents(body.balance, "Balance");
    updates.lastSyncedAt = new Date().toISOString();
  }
  if (body.currency !== undefined)
    updates.currency =
      optionalString(body.currency, "Currency", { max: 3 }) ?? existing.currency;
  if (body.ownerMemberId !== undefined)
    updates.ownerMemberId = await assertOwnerMember(
      db,
      user.familyId,
      optionalString(body.ownerMemberId, "Owner"),
    );

  await db.update(accounts).set(updates).where(eq(accounts.id, id));
  const updated = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
  });
  return c.json({ account: updated ? toAccount(updated) : null });
});

app.delete("/accounts/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Account not found" }, 404);
  await db.delete(accounts).where(eq(accounts.id, id));
  return c.json({ ok: true });
});

// Aggregate financial posture across all family accounts.
app.get("/summary", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const fam = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  const rows = await db.query.accounts.findMany({
    where: eq(accounts.familyId, user.familyId),
  });

  const liabilityTypes = new Set<AccountType>(LIABILITY_ACCOUNT_TYPES);
  const byTypeMap = new Map<AccountType, number>();
  let assets = 0;
  let liabilities = 0;
  for (const a of rows) {
    byTypeMap.set(a.type, (byTypeMap.get(a.type) ?? 0) + a.balanceCents);
    if (liabilityTypes.has(a.type)) liabilities += a.balanceCents;
    else assets += a.balanceCents;
  }

  const summary: FinanceSummary = {
    currency: fam?.currency ?? "GBP",
    totalAssetsCents: assets,
    totalLiabilitiesCents: liabilities,
    netWorthCents: assets - liabilities,
    accountCount: rows.length,
    byType: [...byTypeMap.entries()].map(([type, balanceCents]) => ({
      type,
      balanceCents,
    })),
  };
  return c.json(summary);
});

// ---------------------------------------------------------------------------
// Bank connections (Open Banking)
// ---------------------------------------------------------------------------

// List the family's linked bank connections + which provider is active.
app.get("/connections", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;

  const conns = await db.query.bankConnections.findMany({
    where: eq(bankConnections.familyId, familyId),
    orderBy: [asc(bankConnections.createdAt)],
  });
  const familyAccounts = await db.query.accounts.findMany({
    where: eq(accounts.familyId, familyId),
  });
  const countByConnection = new Map<string, number>();
  for (const a of familyAccounts) {
    if (a.connectionId) {
      countByConnection.set(
        a.connectionId,
        (countByConnection.get(a.connectionId) ?? 0) + 1,
      );
    }
  }

  let providerId = "mock";
  try {
    providerId = getProvider(c.env).id;
  } catch {
    /* misconfigured — reported when the user tries to link */
  }

  return c.json({
    connections: conns.map((conn) =>
      toBankConnection(conn, countByConnection.get(conn.id) ?? 0),
    ),
    provider: providerId,
    liveProvider: hasTrueLayerCredentials(c.env),
  });
});

// Start a link: create a one-time state token and return the consent URL.
app.post("/connections/link", async (c) => {
  const db = c.get("db");
  const user = c.get("user");

  let provider;
  try {
    provider = getProvider(c.env);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Provider unavailable" },
      500,
    );
  }

  const state = generateToken();
  const absoluteRedirect = redirectUri(c.env, c);
  await db.insert(bankOauthStates).values({
    id: state,
    familyId: user.familyId,
    userId: user.id,
    provider: provider.id,
    redirectUri: absoluteRedirect,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
  });

  // The mock provider navigates back through our own callback; keeping it a
  // relative path means dev stays on a single origin (Vite proxy → Worker).
  const authRedirect =
    provider.id === "mock"
      ? "/api/finance/connections/callback"
      : absoluteRedirect;
  return c.json({ authUrl: provider.buildAuthUrl(state, authRedirect) });
});

// Sync one connection now.
app.post("/connections/:id/sync", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const conn = await db.query.bankConnections.findFirst({
    where: and(
      eq(bankConnections.id, c.req.param("id")),
      eq(bankConnections.familyId, familyId),
    ),
  });
  if (!conn) return c.json({ error: "Connection not found" }, 404);
  try {
    const r = await syncConnection(db, c.env, conn);
    return c.json<SyncResult>({
      connections: 1,
      accountsUpdated: r.updated,
      accountsCreated: r.created,
      transactionsAdded: r.transactionsAdded,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      502,
    );
  }
});

// Sync all of the family's connections.
app.post("/sync", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const conns = await db.query.bankConnections.findMany({
    where: eq(bankConnections.familyId, familyId),
  });
  let updated = 0;
  let created = 0;
  let txnsAdded = 0;
  let ok = 0;
  for (const conn of conns) {
    try {
      const r = await syncConnection(db, c.env, conn);
      updated += r.updated;
      created += r.created;
      txnsAdded += r.transactionsAdded;
      ok++;
    } catch {
      /* status/lastError already recorded on the connection */
    }
  }
  return c.json<SyncResult>({
    connections: ok,
    accountsUpdated: updated,
    accountsCreated: created,
    transactionsAdded: txnsAdded,
  });
});

// Disconnect: detach synced accounts (they become manual, keeping balances).
app.delete("/connections/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const conn = await db.query.bankConnections.findFirst({
    where: and(eq(bankConnections.id, id), eq(bankConnections.familyId, familyId)),
  });
  if (!conn) return c.json({ error: "Connection not found" }, 404);

  await db
    .update(accounts)
    .set({ connectionId: null, provider: "manual" })
    .where(eq(accounts.connectionId, id));
  await db.delete(bankConnections).where(eq(bankConnections.id, id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

// List transactions, filterable by month / category / account / direction.
app.get("/transactions", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const { month, category, accountId, direction, limit } = c.req.query();

  const conditions: SQL[] = [eq(transactions.familyId, familyId)];
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    conditions.push(gte(transactions.date, `${month}-01`));
    conditions.push(lte(transactions.date, `${month}-31`));
  }
  if (category)
    conditions.push(
      eq(transactions.category, requireEnum(category, EXPENSE_CATEGORIES, "category")),
    );
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  if (direction === "debit" || direction === "credit")
    conditions.push(eq(transactions.direction, direction));

  const max = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const rows = await db.query.transactions.findMany({
    where: and(...conditions),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit: max,
  });
  return c.json({ transactions: rows.map(toTransaction) });
});

// Re-categorise a transaction (locks it against future auto-categorisation).
app.patch("/transactions/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.transactions.findFirst({
    where: and(eq(transactions.id, id), eq(transactions.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "Transaction not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const category = requireEnum(body.category, EXPENSE_CATEGORIES, "Category");
  await db
    .update(transactions)
    .set({ category, categoryLocked: true })
    .where(eq(transactions.id, id));
  const updated = await db.query.transactions.findFirst({
    where: eq(transactions.id, id),
  });
  return c.json({ transaction: updated ? toTransaction(updated) : null });
});

// Spending insights for a month, derived from synced transactions.
app.get("/insights", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const month = c.req.query("month");
  const monthKey =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : new Date().toISOString().slice(0, 7);

  const fam = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  const rows = await db.query.transactions.findMany({
    where: and(
      eq(transactions.familyId, user.familyId),
      gte(transactions.date, `${monthKey}-01`),
      lte(transactions.date, `${monthKey}-31`),
    ),
  });

  let totalSpentCents = 0;
  let totalIncomeCents = 0;
  const byCategory = new Map<ExpenseCategory, number>();
  const byMerchant = new Map<string, { amountCents: number; count: number }>();

  for (const t of rows) {
    if (t.direction === "credit") {
      totalIncomeCents += t.amountCents;
      continue;
    }
    const spent = Math.abs(t.amountCents);
    totalSpentCents += spent;
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + spent);
    const key = t.merchant || t.description;
    const m = byMerchant.get(key) ?? { amountCents: 0, count: 0 };
    m.amountCents += spent;
    m.count += 1;
    byMerchant.set(key, m);
  }

  const insights: SpendingInsights = {
    month: monthKey,
    currency: fam?.currency ?? "GBP",
    totalSpentCents,
    totalIncomeCents,
    transactionCount: rows.length,
    byCategory: [...byCategory.entries()]
      .map(([category, amountCents]) => ({ category, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents),
    topMerchants: [...byMerchant.entries()]
      .map(([merchant, v]) => ({ merchant, ...v }))
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 6),
  };
  return c.json(insights);
});

// ---------------------------------------------------------------------------
// Budgets & alerts
// ---------------------------------------------------------------------------

// A budget's category: null (overall) or a valid expense category.
function parseCategory(value: unknown): ExpenseCategory | null {
  if (value === undefined || value === null || value === "") return null;
  return requireEnum(value, EXPENSE_CATEGORIES, "Category");
}

// Budgets with spend + status for a given month (defaults to the current month).
app.get("/budgets", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const monthParam = c.req.query("month");
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam
      : currentMonthKey();
  const overview = await buildBudgetsOverview(db, familyId, month);
  return c.json<BudgetsOverview>(overview);
});

// Create a budget for a category (or the overall budget). One per category.
app.post("/budgets", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const category = parseCategory(body.category);
  const amountCents = requireAmountCents(body.amount, "Budget amount");
  if (amountCents <= 0) badRequest("Budget amount must be greater than zero");

  const existingForFamily = await db.query.budgets.findMany({
    where: eq(budgets.familyId, user.familyId),
  });
  if (existingForFamily.some((b) => b.category === category)) {
    badRequest(
      category
        ? "A budget for that category already exists"
        : "An overall budget already exists",
    );
  }

  const id = generateId();
  await db.insert(budgets).values({
    id,
    familyId: user.familyId,
    category,
    amountCents,
    createdBy: user.id,
  });
  const created = await db.query.budgets.findFirst({
    where: eq(budgets.id, id),
  });
  return c.json({ budget: created ? toBudget(created) : null }, 201);
});

// Update a budget's amount.
app.patch("/budgets/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.budgets.findFirst({
    where: and(eq(budgets.id, id), eq(budgets.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "Budget not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const amountCents = requireAmountCents(body.amount, "Budget amount");
  if (amountCents <= 0) badRequest("Budget amount must be greater than zero");

  await db
    .update(budgets)
    .set({ amountCents, updatedAt: new Date().toISOString() })
    .where(eq(budgets.id, id));
  const updated = await db.query.budgets.findFirst({ where: eq(budgets.id, id) });
  return c.json({ budget: updated ? toBudget(updated) : null });
});

app.delete("/budgets/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.budgets.findFirst({
    where: and(eq(budgets.id, id), eq(budgets.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "Budget not found" }, 404);
  await db.delete(budgets).where(eq(budgets.id, id));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Category rules (editable auto-categorisation)
// ---------------------------------------------------------------------------

function parsePriority(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

app.get("/category-rules", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const rows = await db.query.categoryRules.findMany({
    where: eq(categoryRules.familyId, familyId),
    orderBy: [desc(categoryRules.priority), asc(categoryRules.createdAt)],
  });
  return c.json({ rules: rows.map(toCategoryRule) });
});

app.post("/category-rules", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const pattern = requireString(body.pattern, "Pattern", { max: 120 });
  const category = requireEnum(body.category, EXPENSE_CATEGORIES, "Category");
  const priority = parsePriority(body.priority);

  const id = generateId();
  await db.insert(categoryRules).values({
    id,
    familyId: user.familyId,
    pattern,
    category,
    priority,
    createdBy: user.id,
  });
  const created = await db.query.categoryRules.findFirst({
    where: eq(categoryRules.id, id),
  });
  const updated = await reapplyRules(db, user.familyId);
  return c.json({ rule: created ? toCategoryRule(created) : null, updated }, 201);
});

app.patch("/category-rules/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.categoryRules.findFirst({
    where: and(eq(categoryRules.id, id), eq(categoryRules.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "Rule not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof categoryRules.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (body.pattern !== undefined)
    updates.pattern = requireString(body.pattern, "Pattern", { max: 120 });
  if (body.category !== undefined)
    updates.category = requireEnum(body.category, EXPENSE_CATEGORIES, "Category");
  if (body.priority !== undefined) updates.priority = parsePriority(body.priority);

  await db.update(categoryRules).set(updates).where(eq(categoryRules.id, id));
  const row = await db.query.categoryRules.findFirst({
    where: eq(categoryRules.id, id),
  });
  const updated = await reapplyRules(db, familyId);
  return c.json({ rule: row ? toCategoryRule(row) : null, updated });
});

app.delete("/category-rules/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const existing = await db.query.categoryRules.findFirst({
    where: and(eq(categoryRules.id, id), eq(categoryRules.familyId, familyId)),
  });
  if (!existing) return c.json({ error: "Rule not found" }, 404);
  await db.delete(categoryRules).where(eq(categoryRules.id, id));
  const updated = await reapplyRules(db, familyId);
  return c.json({ ok: true, updated });
});

// Re-run all rules over existing (unlocked) transactions.
app.post("/category-rules/apply", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const updated = await reapplyRules(db, familyId);
  return c.json<ApplyRulesResult>({ updated });
});

// Public OAuth callback (secured by the one-time `state`, not the session).
// Registered directly on the app before the auth gate — see worker/index.ts.
export const bankCallback = async (c: Context<AppEnv>) => {
  const db = c.get("db");
  const { code, state, error } = c.req.query();
  const fail = (msg: string) =>
    c.redirect(`/finance?bank_error=${encodeURIComponent(msg)}`);

  if (error) return fail(error);
  if (!code || !state) return fail("Missing authorization response");

  const stateRow = await db.query.bankOauthStates.findFirst({
    where: eq(bankOauthStates.id, state),
  });
  if (!stateRow) return fail("Invalid or expired link session");
  // State is single-use.
  await db.delete(bankOauthStates).where(eq(bankOauthStates.id, state));
  if (new Date(stateRow.expiresAt).getTime() < Date.now()) {
    return fail("Link session expired — please try again");
  }

  try {
    await completeConnection(db, c.env, {
      familyId: stateRow.familyId,
      userId: stateRow.userId,
      code,
      redirectUri: stateRow.redirectUri,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not connect bank");
  }
  return c.redirect("/finance?bank_connected=1");
};

export default app;
