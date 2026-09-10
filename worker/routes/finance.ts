import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { accounts, families, users } from "../db/schema";
import { generateId } from "../lib/crypto";
import { toAccount } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalString,
  requireAmountCents,
  requireEnum,
  requireString,
} from "../lib/validate";
import {
  ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  type AccountType,
  type FinanceSummary,
} from "@shared/types";

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

export default app;
