import { Hono } from "hono";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { expenses, families, users } from "../db/schema";
import { generateId } from "../lib/crypto";
import { toExpense } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalString,
  requireAmountCents,
  requireDate,
  requireEnum,
  requireString,
} from "../lib/validate";
import { EXPENSE_CATEGORIES } from "@shared/types";

const app = new Hono<AppEnv>();

async function familyCurrency(
  db: AppEnv["Variables"]["db"],
  familyId: string,
): Promise<string> {
  const fam = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });
  return fam?.currency ?? "GBP";
}

async function assertPaidBy(
  db: AppEnv["Variables"]["db"],
  familyId: string,
  paidBy: string | null,
): Promise<string | null> {
  if (!paidBy) return null;
  const member = await db.query.users.findFirst({
    where: and(eq(users.id, paidBy), eq(users.familyId, familyId)),
  });
  if (!member) badRequest("Payer is not part of this family");
  return paidBy;
}

app.get("/", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const { from, to, category, paidBy, month } = c.req.query();

  const conditions: SQL[] = [eq(expenses.familyId, familyId)];
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    conditions.push(gte(expenses.spentAt, `${month}-01`));
    conditions.push(lte(expenses.spentAt, `${month}-31`));
  }
  if (from) conditions.push(gte(expenses.spentAt, from));
  if (to) conditions.push(lte(expenses.spentAt, to));
  if (category)
    conditions.push(
      eq(expenses.category, requireEnum(category, EXPENSE_CATEGORIES, "category")),
    );
  if (paidBy) conditions.push(eq(expenses.paidBy, paidBy));

  const rows = await db.query.expenses.findMany({
    where: and(...conditions),
    orderBy: [desc(expenses.spentAt), desc(expenses.createdAt)],
    limit: 1000,
  });
  return c.json({ expenses: rows.map(toExpense) });
});

app.post("/", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const description = requireString(body.description, "Description", { max: 200 });
  const amountCents = requireAmountCents(body.amount, "Amount");
  if (amountCents <= 0) badRequest("Amount must be greater than zero");
  const category = requireEnum(body.category, EXPENSE_CATEGORIES, "Category");
  const spentAt = requireDate(body.spentAt, "Date");
  const paidBy = await assertPaidBy(
    db,
    user.familyId,
    optionalString(body.paidBy, "Payer"),
  );
  const currency =
    optionalString(body.currency, "Currency", { max: 3 }) ??
    (await familyCurrency(db, user.familyId));

  const id = generateId();
  await db.insert(expenses).values({
    id,
    familyId: user.familyId,
    description,
    amountCents,
    currency,
    category,
    paidBy,
    spentAt,
    createdBy: user.id,
  });
  const created = await db.query.expenses.findFirst({
    where: eq(expenses.id, id),
  });
  return c.json({ expense: created ? toExpense(created) : null }, 201);
});

app.patch("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, id), eq(expenses.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Expense not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof expenses.$inferInsert> = {};
  if (body.description !== undefined)
    updates.description = requireString(body.description, "Description", { max: 200 });
  if (body.amount !== undefined) {
    const cents = requireAmountCents(body.amount, "Amount");
    if (cents <= 0) badRequest("Amount must be greater than zero");
    updates.amountCents = cents;
  }
  if (body.category !== undefined)
    updates.category = requireEnum(body.category, EXPENSE_CATEGORIES, "Category");
  if (body.spentAt !== undefined)
    updates.spentAt = requireDate(body.spentAt, "Date");
  if (body.paidBy !== undefined)
    updates.paidBy = await assertPaidBy(
      db,
      user.familyId,
      optionalString(body.paidBy, "Payer"),
    );
  if (body.currency !== undefined)
    updates.currency =
      optionalString(body.currency, "Currency", { max: 3 }) ?? existing.currency;

  await db.update(expenses).set(updates).where(eq(expenses.id, id));
  const updated = await db.query.expenses.findFirst({
    where: eq(expenses.id, id),
  });
  return c.json({ expense: updated ? toExpense(updated) : null });
});

app.delete("/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, id), eq(expenses.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Expense not found" }, 404);
  await db.delete(expenses).where(eq(expenses.id, id));
  return c.json({ ok: true });
});

export default app;
