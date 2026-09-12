import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { families, notifications, users } from "../db/schema";
import { generateId } from "./crypto";
import { buildBudgetsOverview, currentMonthKey } from "./budgets";
import { getEmailProvider } from "./email";
import { pushToFamily } from "./push";
import type { Bindings } from "./types";
import {
  EXPENSE_CATEGORY_LABELS,
  type BudgetProgress,
  type ExpenseCategory,
} from "@shared/types";

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function budgetLabel(category: string | null): string {
  return category
    ? EXPENSE_CATEGORY_LABELS[category as ExpenseCategory]
    : "Overall budget";
}

function messageFor(a: BudgetProgress, currency: string) {
  const label = budgetLabel(a.category);
  const pct = Math.round(a.percent * 100);
  const amounts = `${money(a.spentCents, currency)} of ${money(a.amountCents, currency)} (${pct}%)`;
  if (a.status === "over") {
    return {
      title: `${label} is over budget`,
      body: `You've spent ${amounts} this month.`,
    };
  }
  return {
    title: `${label} is nearing its limit`,
    body: `You've spent ${amounts} this month.`,
  };
}

async function emailAlert(
  db: Db,
  env: Bindings,
  familyId: string,
  subject: string,
  body: string,
): Promise<void> {
  const fam = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });
  if (!fam || !fam.alertEmails) return;

  // Only active members who still want budget alerts.
  const members = await db.query.users.findMany({
    where: and(
      eq(users.familyId, familyId),
      eq(users.status, "active"),
      eq(users.notifyBudgetAlerts, true),
    ),
    columns: { email: true },
  });
  const to = members.map((m) => m.email).filter(Boolean);
  if (to.length === 0) return;

  try {
    await getEmailProvider(env).send({
      to,
      subject: `OdexOS · ${subject}`,
      text: `${body}\n\nManage your budgets in OdexOS.`,
    });
  } catch (err) {
    console.error("Budget alert email failed:", err);
  }
}

/**
 * Creates notifications (and sends emails) for any budget that has newly
 * crossed a threshold this month. Deduped by (family, budget, month, status).
 * Returns the number of new notifications created.
 */
export async function checkBudgetAlerts(
  db: Db,
  env: Bindings,
  familyId: string,
): Promise<number> {
  const month = currentMonthKey();
  const overview = await buildBudgetsOverview(db, familyId, month);
  let created = 0;

  for (const alert of overview.alerts) {
    const dedupeKey = `budget:${alert.id}:${month}:${alert.status}`;
    const existing = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.familyId, familyId),
        eq(notifications.dedupeKey, dedupeKey),
      ),
    });
    if (existing) continue;

    const { title, body } = messageFor(alert, overview.currency);
    await db.insert(notifications).values({
      id: generateId(),
      familyId,
      type: alert.status === "over" ? "budget_over" : "budget_warning",
      title,
      body,
      category: alert.category,
      month,
      dedupeKey,
    });
    created++;
    await emailAlert(db, env, familyId, title, body);
    await pushToFamily(db, env, familyId, { title, body, url: "/budgets", tag: dedupeKey }, "budget");
  }

  return created;
}
