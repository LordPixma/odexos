import { and, eq, gte, lte, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  activities,
  families,
  listItems,
  lists,
  meals,
  users,
} from "../db/schema";
import { toActivity } from "./serialize";
import { expandActivities } from "./recurrence";
import {
  buildBudgetsOverview,
  computeSpendByCategory,
  currentMonthKey,
} from "./budgets";
import { getEmailProvider } from "./email";
import type { Bindings } from "./types";
import {
  EXPENSE_CATEGORY_LABELS,
  MEAL_SLOT_LABELS,
  type Activity,
  type ExpenseCategory,
  type Meal,
} from "@shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DOW = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const DOWLONG = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" });

function startOfTodayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
export function mondayUTC(now: Date): string {
  const d = startOfTodayUTC(now);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

interface DigestData {
  familyName: string;
  currency: string;
  upcoming: Activity[];
  meals: Meal[];
  monthSpendCents: number;
  overallStatus: string | null;
  alerts: { label: string; pct: number; over: boolean }[];
  openItems: { list: string; text: string }[];
  openItemCount: number;
}

async function gatherDigest(db: Db, familyId: string): Promise<DigestData> {
  const now = new Date();
  const todayStart = startOfTodayUTC(now);
  const weekEnd = new Date(todayStart.getTime() + 7 * DAY_MS);

  const fam = await db.query.families.findFirst({ where: eq(families.id, familyId) });
  const currency = fam?.currency ?? "GBP";

  // Activities for the next 7 days (expanding recurring series).
  const nonRecurring = await db.query.activities.findMany({
    where: and(
      eq(activities.familyId, familyId),
      eq(activities.recurrence, "none"),
      gte(activities.startsAt, todayStart.toISOString()),
      lte(activities.startsAt, weekEnd.toISOString()),
    ),
    limit: 300,
  });
  const recurring = await db.query.activities.findMany({
    where: and(eq(activities.familyId, familyId), ne(activities.recurrence, "none")),
    limit: 200,
  });
  const upcoming = expandActivities(
    [...nonRecurring, ...recurring].map(toActivity),
    todayStart,
    weekEnd,
  );

  // Meals for the current week (Mon–Sun).
  const monday = mondayUTC(now);
  const sunday = new Date(new Date(`${monday}T00:00:00Z`).getTime() + 6 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const mealRows = await db.query.meals.findMany({
    where: and(eq(meals.familyId, familyId), gte(meals.date, monday), lte(meals.date, sunday)),
  });

  // Budgets + total spend this month.
  const month = currentMonthKey(now);
  const overview = await buildBudgetsOverview(db, familyId, month);
  const monthSpendCents = (await computeSpendByCategory(db, familyId, month))
    .totalCents;
  const overallStatus = overview.overall
    ? `${money(overview.overall.spentCents, currency)} of ${money(
        overview.overall.amountCents,
        currency,
      )} (${Math.round(overview.overall.percent * 100)}%)`
    : null;
  const alerts = overview.alerts.map((a) => ({
    label: a.category
      ? EXPENSE_CATEGORY_LABELS[a.category as ExpenseCategory]
      : "Overall budget",
    pct: Math.round(a.percent * 100),
    over: a.remainingCents < 0,
  }));

  // Open list items.
  const listRows = await db.query.lists.findMany({ where: eq(lists.familyId, familyId) });
  const listName = new Map(listRows.map((l) => [l.id, l.name]));
  const openRows = await db.query.listItems.findMany({
    where: and(eq(listItems.familyId, familyId), eq(listItems.done, false)),
    limit: 100,
  });
  const openItems = openRows
    .slice(0, 8)
    .map((i) => ({ list: listName.get(i.listId) ?? "List", text: i.text }));

  return {
    familyName: fam?.name ?? "Your family",
    currency,
    upcoming: upcoming.slice(0, 12),
    meals: mealRows,
    monthSpendCents,
    overallStatus,
    alerts,
    openItems,
    openItemCount: openRows.length,
  };
}

export interface DigestContent {
  subject: string;
  text: string;
  html: string;
}

export function renderDigest(d: DigestData): DigestContent {
  const subject = `Your week at ${d.familyName}`;

  // ---- text ----
  const t: string[] = [`${subject}`, ""];
  t.push("THE WEEK AHEAD");
  if (d.upcoming.length === 0) t.push("  Nothing scheduled.");
  else
    for (const a of d.upcoming)
      t.push(
        `  ${DOW.format(new Date(a.startsAt))} ${a.allDay ? "all day" : TIME.format(new Date(a.startsAt))} — ${a.title}`,
      );
  t.push("");

  t.push("MEAL PLAN");
  if (d.meals.length === 0) t.push("  No meals planned yet.");
  else
    for (const m of [...d.meals].sort((a, b) => a.date.localeCompare(b.date)))
      t.push(
        `  ${DOW.format(new Date(`${m.date}T00:00:00Z`))} ${MEAL_SLOT_LABELS[m.slot]}: ${m.title}`,
      );
  t.push("");

  t.push("SPENDING");
  t.push(`  This month so far: ${money(d.monthSpendCents, d.currency)}`);
  if (d.overallStatus) t.push(`  Overall budget: ${d.overallStatus}`);
  for (const a of d.alerts)
    t.push(`  ${a.over ? "OVER" : "Heads up"}: ${a.label} at ${a.pct}%`);
  t.push("");

  t.push("LISTS");
  if (d.openItemCount === 0) t.push("  Nothing outstanding.");
  else {
    t.push(`  ${d.openItemCount} open item${d.openItemCount === 1 ? "" : "s"}:`);
    for (const it of d.openItems) t.push(`  - ${it.text} (${it.list})`);
  }

  const text = t.join("\n");

  // ---- html ----
  const section = (title: string, inner: string) =>
    `<tr><td style="padding:20px 24px 4px;font:600 12px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;">${title}</td></tr><tr><td style="padding:0 24px 8px;font:14px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">${inner}</td></tr>`;

  const activitiesHtml = d.upcoming.length
    ? d.upcoming
        .map(
          (a) =>
            `<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#64748b;">${DOW.format(new Date(a.startsAt))} · ${a.allDay ? "All day" : escapeHtml(TIME.format(new Date(a.startsAt)))}</span><br><strong>${escapeHtml(a.title)}</strong>${a.location ? ` <span style="color:#94a3b8;">· ${escapeHtml(a.location)}</span>` : ""}</div>`,
        )
        .join("")
    : `<span style="color:#94a3b8;">Nothing scheduled.</span>`;

  const mealsHtml = d.meals.length
    ? [...d.meals]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(
          (m) =>
            `<div style="padding:4px 0;"><span style="color:#64748b;">${DOWLONG.format(new Date(`${m.date}T00:00:00Z`))} · ${MEAL_SLOT_LABELS[m.slot]}</span> — ${escapeHtml(m.title)}</div>`,
        )
        .join("")
    : `<span style="color:#94a3b8;">No meals planned yet.</span>`;

  const alertsHtml = d.alerts
    .map(
      (a) =>
        `<div style="padding:2px 0;color:${a.over ? "#dc2626" : "#b45309"};">${a.over ? "⚠ Over budget" : "Heads up"}: <strong>${escapeHtml(a.label)}</strong> at ${a.pct}%</div>`,
    )
    .join("");
  const spendHtml =
    `<div>This month so far: <strong>${money(d.monthSpendCents, d.currency)}</strong></div>` +
    (d.overallStatus ? `<div style="color:#64748b;">Overall budget: ${escapeHtml(d.overallStatus)}</div>` : "") +
    alertsHtml;

  const listsHtml = d.openItemCount
    ? `<div style="color:#64748b;margin-bottom:4px;">${d.openItemCount} open item${d.openItemCount === 1 ? "" : "s"}</div>` +
      d.openItems
        .map(
          (it) =>
            `<div style="padding:2px 0;">• ${escapeHtml(it.text)} <span style="color:#94a3b8;">(${escapeHtml(it.list)})</span></div>`,
        )
        .join("")
    : `<span style="color:#94a3b8;">Nothing outstanding.</span>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:#4f46e5;padding:22px 24px;color:#fff;font:800 18px/1.2 -apple-system,Segoe UI,Roboto,Arial,sans-serif;">OdexOS<div style="font:500 13px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#c7d2fe;margin-top:2px;">${escapeHtml(subject)}</div></td></tr>
${section("The week ahead", activitiesHtml)}
${section("Meal plan", mealsHtml)}
${section("Spending", spendHtml)}
${section("Lists", listsHtml)}
<tr><td style="padding:18px 24px;color:#94a3b8;font:12px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;border-top:1px solid #f1f5f9;">Sent by OdexOS · your family's command center. Turn this off in Alerts settings.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}

export async function buildDigest(db: Db, familyId: string): Promise<DigestContent> {
  return renderDigest(await gatherDigest(db, familyId));
}

/**
 * Sends the weekly digest to the family. When `force` is false, respects the
 * `weeklyDigest` setting and skips if already sent for the current week.
 * Returns the number of recipients emailed (0 if skipped).
 */
export async function sendDigest(
  db: Db,
  env: Bindings,
  familyId: string,
  force = false,
): Promise<number> {
  const fam = await db.query.families.findFirst({ where: eq(families.id, familyId) });
  if (!fam) return 0;
  const thisWeek = mondayUTC(new Date());
  if (!force) {
    if (!fam.weeklyDigest) return 0;
    if (fam.lastDigestWeek === thisWeek) return 0;
  }

  const content = renderDigest(await gatherDigest(db, familyId));
  // Only active members who haven't opted out of the digest.
  const members = await db.query.users.findMany({
    where: and(
      eq(users.familyId, familyId),
      eq(users.status, "active"),
      eq(users.notifyWeeklyDigest, true),
    ),
    columns: { email: true },
  });
  const to = members.map((m) => m.email).filter(Boolean);

  if (to.length > 0) {
    try {
      await getEmailProvider(env).send({
        to,
        subject: `OdexOS · ${content.subject}`,
        text: content.text,
        html: content.html,
      });
    } catch (err) {
      console.error("Weekly digest email failed:", err);
      return 0;
    }
  }

  await db
    .update(families)
    .set({ lastDigestWeek: thisWeek })
    .where(eq(families.id, familyId));
  return to.length;
}
