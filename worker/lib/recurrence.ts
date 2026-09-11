import type { Activity, RecurrenceRule } from "@shared/types";

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function advance(date: Date, rule: RecurrenceRule): Date {
  const d = new Date(date);
  switch (rule) {
    case "daily":
    case "weekdays":
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    default:
      d.setUTCFullYear(d.getUTCFullYear() + 100); // effectively stop
  }
  return d;
}

const HARD_CAP = 500;

/**
 * Expands base activities into concrete occurrences within [from, to].
 * Non-recurring activities pass through if they fall in the window. Recurring
 * ones generate occurrences (each with a unique id and `seriesId` = base id).
 */
export function expandActivities(
  base: Activity[],
  from: Date,
  to: Date,
): Activity[] {
  const out: Activity[] = [];

  for (const a of base) {
    if (a.recurrence === "none") {
      const s = new Date(a.startsAt);
      if (s >= from && s <= to) out.push(a);
      continue;
    }

    const start = new Date(a.startsAt);
    const durationMs = a.endsAt
      ? new Date(a.endsAt).getTime() - start.getTime()
      : 0;
    const until = a.recurrenceUntil
      ? new Date(`${a.recurrenceUntil}T23:59:59.999Z`)
      : null;

    let occ = new Date(start);
    let count = 0;
    while (count < HARD_CAP) {
      count++;
      if (occ > to) break;
      if (until && occ > until) break;

      const valid =
        occ >= start &&
        occ >= from &&
        (a.recurrence !== "weekdays" || !isWeekend(occ));
      if (valid) {
        const occEnd = durationMs
          ? new Date(occ.getTime() + durationMs).toISOString()
          : null;
        out.push({
          ...a,
          id: `${a.id}@${occ.toISOString().slice(0, 10)}`,
          seriesId: a.id,
          startsAt: occ.toISOString(),
          endsAt: occEnd,
        });
      }
      occ = advance(occ, a.recurrence);
    }
  }

  out.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  return out;
}
