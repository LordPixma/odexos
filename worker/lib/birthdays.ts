import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { families, users } from "../db/schema";
import type { UserRow } from "../db/schema";
import { getEmailProvider } from "./email";
import { pushToFamily } from "./push";
import type { Bindings } from "./types";
import type { UpcomingBirthday } from "@shared/types";

/** How far ahead the dashboard looks. */
export const BIRTHDAY_HORIZON_DAYS = 90;
/** Days-ahead marks that trigger a reminder email (0 = on the day). */
const REMINDER_DAYS = [0, 7];

const DAY_MS = 86_400_000;

function startOfDayUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Next occurrence of a birthday on/after today. Feb 29 falls back to Feb 28 in
 * non-leap years. Returns null for unparseable dates.
 */
function nextOccurrence(
  birthday: string,
  today: Date,
): { dateMs: number; turning: number | null } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return null;
  const birthYear = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const todayMs = startOfDayUTC(today);
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const occ = Date.UTC(year, month - 1, Math.min(day, daysInMonth));
    if (occ >= todayMs) {
      return { dateMs: occ, turning: birthYear > 1900 ? year - birthYear : null };
    }
  }
  return null;
}

/** Members with a birthday coming up, soonest first. */
export function upcomingBirthdays(
  members: UserRow[],
  today: Date,
  withinDays = BIRTHDAY_HORIZON_DAYS,
): UpcomingBirthday[] {
  const todayMs = startOfDayUTC(today);
  const out: UpcomingBirthday[] = [];
  for (const m of members) {
    // Pending invitees are still family — their birthday counts. (Only the
    // *recipients* of reminder emails are restricted to active accounts.)
    if (!m.birthday) continue;
    const next = nextOccurrence(m.birthday, today);
    if (!next) continue;
    const daysUntil = Math.round((next.dateMs - todayMs) / DAY_MS);
    if (daysUntil > withinDays) continue;
    out.push({
      memberId: m.id,
      name: m.name,
      nickname: m.nickname,
      color: m.color,
      avatarVersion: m.avatarVersion,
      date: new Date(next.dateMs).toISOString().slice(0, 10),
      daysUntil,
      turning: next.turning,
    });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

function describe(b: UpcomingBirthday): string {
  const who = b.nickname || b.name;
  const age = b.turning ? ` — turning ${b.turning}` : "";
  if (b.daysUntil === 0) return `🎂 It's ${who}'s birthday today${age}!`;
  const when = b.daysUntil === 1 ? "tomorrow" : `in ${b.daysUntil} days`;
  return `🎂 ${who}'s birthday is ${when}${age}.`;
}

/**
 * Email the family about birthdays happening today or a week out. Runs at most
 * once per family per day (guarded by families.last_birthday_date).
 */
export async function sendBirthdayReminders(
  db: Db,
  env: Bindings,
  familyId: string,
  force = false,
): Promise<number> {
  const fam = await db.query.families.findFirst({
    where: eq(families.id, familyId),
  });
  if (!fam) return 0;
  if (!force && !fam.alertEmails) return 0;

  const today = new Date();
  const todayKey = new Date(startOfDayUTC(today)).toISOString().slice(0, 10);
  if (!force && fam.lastBirthdayDate === todayKey) return 0;

  const memberRows = await db.query.users.findMany({
    where: eq(users.familyId, familyId),
  });
  const due = upcomingBirthdays(memberRows, today, Math.max(...REMINDER_DAYS)).filter(
    (b) => REMINDER_DAYS.includes(b.daysUntil),
  );

  // Mark the day as handled even when there's nothing to send, so we don't
  // re-scan on every cron tick.
  await db
    .update(families)
    .set({ lastBirthdayDate: todayKey })
    .where(eq(families.id, familyId));

  if (due.length === 0) return 0;

  const recipients = await db.query.users.findMany({
    where: and(eq(users.familyId, familyId), eq(users.status, "active")),
    columns: { email: true },
  });
  const to = recipients.map((r) => r.email).filter(Boolean);
  if (to.length === 0) return 0;

  const appName = env.APP_NAME || "OdexOS";
  const lines = due.map(describe);
  const subject =
    due.some((b) => b.daysUntil === 0)
      ? `🎂 ${due.find((b) => b.daysUntil === 0)!.nickname || due.find((b) => b.daysUntil === 0)!.name}'s birthday is today`
      : `🎂 Birthdays coming up in ${fam.name}`;

  const text = [`${fam.name}`, "", ...lines, "", `— ${appName}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#0a0d17;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6eaf3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;">
    <tr><td style="background:#141b2b;border:1px solid rgba(255,255,255,0.07);border-radius:18px;padding:28px;">
      <h1 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#ffffff;">Birthdays in ${fam.name}</h1>
      ${lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#cbd5e1;">${l}</p>`).join("")}
    </td></tr>
    <tr><td style="padding:16px 4px;color:#64748b;font-size:12px;">Sent by ${appName}</td></tr>
  </table></body></html>`;

  // A birthday is the kind of thing you want on your phone, not just in a
  // mailbox you check twice a day.
  await pushToFamily(
    db,
    env,
    familyId,
    { title: subject, body: lines.join(" · "), url: "/family", tag: `birthday:${todayKey}` },
    "digest",
  );

  try {
    await getEmailProvider(env).send({ to, subject, text, html });
  } catch (err) {
    console.error("Birthday reminder email failed:", err);
    return 0;
  }
  return to.length;
}
