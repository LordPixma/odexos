import type { Activity, RecurrenceRule } from "@shared/types";

/**
 * Where the family lives, for the purpose of "same time next week".
 *
 * A repeating time is a wall-clock promise: a lesson at 08:35 is at 08:35 in
 * November too. Advancing an instant by 7×24h doesn't keep that promise —
 * every series slides an hour at the clock change — so the walk below happens
 * on the local calendar and only converts back to an instant at the end.
 */
const DEFAULT_TZ = "Europe/London";

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** How far ahead of UTC `tz` is at this instant, in milliseconds. */
function offsetMs(instant: Date, tz: string): number {
  const parts = formatterFor(tz).formatToParts(instant);
  const n = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour") % 24, // some engines render midnight as hour 24
    n("minute"),
    n("second"),
  );
  return asUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * A "local" Date: a real Date shifted so that its UTC fields read as the wall
 * clock in `tz`. Only ever used for calendar arithmetic and weekday checks —
 * never handed out, because as an instant it is an hour or two wrong.
 */
function toLocal(instant: Date, tz: string): Date {
  return new Date(instant.getTime() + offsetMs(instant, tz));
}

/**
 * The reverse. `hint` is the offset at the series anchor; it's right except
 * across a clock change, and one correction settles it.
 */
function toInstant(local: Date, hint: number, tz: string): Date {
  const guess = new Date(local.getTime() - hint);
  const actual = offsetMs(guess, tz);
  return actual === hint ? guess : new Date(local.getTime() - actual);
}

function stepLocal(local: Date, rule: RecurrenceRule): void {
  switch (rule) {
    case "daily":
    case "weekdays":
      local.setUTCDate(local.getUTCDate() + 1);
      break;
    case "weekly":
      local.setUTCDate(local.getUTCDate() + 7);
      break;
    case "fortnightly":
      local.setUTCDate(local.getUTCDate() + 14);
      break;
    case "monthly":
      local.setUTCMonth(local.getUTCMonth() + 1);
      break;
    default:
      local.setUTCFullYear(local.getUTCFullYear() + 100); // effectively stop
  }
}

function isLocalWeekend(local: Date): boolean {
  const day = local.getUTCDay();
  return day === 0 || day === 6;
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
  tz: string = DEFAULT_TZ,
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

    const anchor = offsetMs(start, tz);
    const local = new Date(start.getTime() + anchor);

    let count = 0;
    while (count < HARD_CAP) {
      count++;
      const occ = toInstant(local, anchor, tz);
      if (occ > to) break;
      if (until && occ > until) break;

      const valid =
        occ >= start &&
        occ >= from &&
        (a.recurrence !== "weekdays" || !isLocalWeekend(local));
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
      stepLocal(local, a.recurrence);
    }
  }

  out.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  return out;
}

/** Exported for the calendar feed, which needs the same wall-clock rules. */
export { DEFAULT_TZ, toLocal };
