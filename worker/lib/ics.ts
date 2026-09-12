// Builds an iCalendar (RFC 5545) document for a family's calendar feed, so
// Apple Calendar, Google Calendar and Outlook can subscribe to it.
//
// Recurring things are emitted as RRULEs rather than expanded occurrences: the
// feed stays small, and the calendar keeps showing events indefinitely instead
// of running out at whatever horizon we picked.

import type {
  Activity,
  ChoreCadence,
  Member,
  RecurrenceRule,
} from "@shared/types";
import { ACTIVITY_CATEGORY_LABELS } from "@shared/types";

export interface IcsChore {
  id: string;
  title: string;
  notes: string | null;
  cadence: ChoreCadence;
  dueDate: string; // YYYY-MM-DD
  assignedTo: string | null;
}

export interface BuildFeedOptions {
  familyName: string;
  activities: Activity[];
  members: Member[];
  chores: IcsChore[];
  /** Overridden in tests; defaults to now. */
  now?: Date;
}

/**
 * Escapes a value for a text property: backslash, semicolon and comma are
 * literal characters that must be escaped, and newlines become "\n".
 * RFC 5545 §3.3.11.
 */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a content line to 75 octets, continuing with a leading space.
 * Counts UTF-8 bytes, not characters, and never splits a multi-byte sequence —
 * an emoji in an event title would otherwise corrupt the line.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  const decoder = new TextDecoder();
  let start = 0;
  // The first line takes 75 octets; continuations take 74 (a space is prepended).
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off to a UTF-8 boundary: continuation bytes are 0b10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    chunks.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    limit = 74;
  }
  return chunks.join("\r\n ");
}

/** UTC timestamp form: 20260912T073000Z. */
function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Date-only form: 20260912. */
function dateStamp(ymd: string): string {
  return ymd.replace(/-/g, "");
}

/**
 * Is this a date that actually exists? Input is validated on the way in, but a
 * single bad row predating that check would emit a malformed VEVENT — and some
 * clients reject the entire feed over one, so such rows are skipped instead.
 */
function realDay(ymd: string | null | undefined): ymd is string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const d = new Date(`${ymd}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd;
}

/** DTEND for an all-day event is exclusive, so it lands on the next day. */
function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const ACTIVITY_RRULE: Record<RecurrenceRule, string | null> = {
  none: null,
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};

const CHORE_RRULE: Record<ChoreCadence, string | null> = {
  once: null,
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};

class Lines {
  private readonly out: string[] = [];

  add(name: string, value: string, params = ""): void {
    if (!value) return;
    this.out.push(fold(`${name}${params}:${value}`));
  }

  raw(line: string): void {
    this.out.push(line);
  }

  /** CRLF-terminated, as RFC 5545 requires — LF alone breaks Outlook. */
  toString(): string {
    return `${this.out.join("\r\n")}\r\n`;
  }
}

export function buildFamilyFeed(opts: BuildFeedOptions): string {
  const { familyName, activities, members, chores } = opts;
  const stamp = utcStamp((opts.now ?? new Date()).toISOString());
  const byId = new Map(members.map((m) => [m.id, m]));
  const who = (id: string | null): string | null => {
    const m = id ? byId.get(id) : null;
    return m ? (m.nickname ?? m.name) : null;
  };

  const l = new Lines();
  l.raw("BEGIN:VCALENDAR");
  l.add("VERSION", "2.0");
  l.add("PRODID", "-//OdexOS//Family Calendar//EN");
  l.add("CALSCALE", "GREGORIAN");
  l.add("METHOD", "PUBLISH");
  l.add("X-WR-CALNAME", esc(familyName));
  l.add("X-WR-CALDESC", esc(`${familyName} — plans, birthdays and chores`));
  // Both spellings: Apple reads REFRESH-INTERVAL, Outlook X-PUBLISHED-TTL.
  l.add("REFRESH-INTERVAL", "PT1H", ";VALUE=DURATION");
  l.add("X-PUBLISHED-TTL", "PT1H");

  for (const a of activities) {
    if (Number.isNaN(new Date(a.startsAt).getTime())) continue;
    // Expanded occurrences carry "<baseId>@<date>"; the series itself is what
    // the RRULE describes, so only base activities reach here.
    l.raw("BEGIN:VEVENT");
    l.add("UID", `activity-${a.id}@odexos`);
    l.add("DTSTAMP", stamp);

    if (a.allDay) {
      const day = a.startsAt.slice(0, 10);
      l.add("DTSTART", dateStamp(day), ";VALUE=DATE");
      l.add("DTEND", dateStamp(nextDay(a.endsAt?.slice(0, 10) ?? day)), ";VALUE=DATE");
    } else {
      l.add("DTSTART", utcStamp(a.startsAt));
      if (a.endsAt) l.add("DTEND", utcStamp(a.endsAt));
    }

    const rule = ACTIVITY_RRULE[a.recurrence];
    if (rule) {
      const until = realDay(a.recurrenceUntil)
        ? `;UNTIL=${dateStamp(a.recurrenceUntil)}T235959Z`
        : "";
      l.add("RRULE", `${rule}${until}`);
    }

    l.add("SUMMARY", esc(a.title));
    if (a.location) l.add("LOCATION", esc(a.location));

    const owner = who(a.memberId);
    const description = [
      a.notes,
      owner ? `For ${owner}` : null,
      ACTIVITY_CATEGORY_LABELS[a.category],
    ]
      .filter(Boolean)
      .join("\n");
    l.add("DESCRIPTION", esc(description));
    l.add("CATEGORIES", esc(ACTIVITY_CATEGORY_LABELS[a.category]));
    l.raw("END:VEVENT");
  }

  for (const m of members) {
    if (!realDay(m.birthday)) continue;
    const name = m.nickname ?? m.name;
    l.raw("BEGIN:VEVENT");
    l.add("UID", `birthday-${m.id}@odexos`);
    l.add("DTSTAMP", stamp);
    l.add("DTSTART", dateStamp(m.birthday), ";VALUE=DATE");
    l.add("DTEND", dateStamp(nextDay(m.birthday)), ";VALUE=DATE");
    l.add("RRULE", "FREQ=YEARLY");
    l.add("SUMMARY", esc(`🎂 ${name}'s birthday`));
    l.add("CATEGORIES", "Birthday");
    l.add("TRANSP", "TRANSPARENT"); // doesn't make anyone look busy
    l.raw("END:VEVENT");
  }

  for (const ch of chores) {
    if (!realDay(ch.dueDate)) continue;
    const owner = who(ch.assignedTo);
    l.raw("BEGIN:VEVENT");
    l.add("UID", `chore-${ch.id}@odexos`);
    l.add("DTSTAMP", stamp);
    l.add("DTSTART", dateStamp(ch.dueDate), ";VALUE=DATE");
    l.add("DTEND", dateStamp(nextDay(ch.dueDate)), ";VALUE=DATE");
    const rule = CHORE_RRULE[ch.cadence];
    if (rule) l.add("RRULE", rule);
    l.add("SUMMARY", esc(owner ? `${ch.title} (${owner})` : ch.title));
    if (ch.notes) l.add("DESCRIPTION", esc(ch.notes));
    l.add("CATEGORIES", "Chore");
    l.add("TRANSP", "TRANSPARENT");
    l.raw("END:VEVENT");
  }

  l.raw("END:VCALENDAR");
  return l.toString();
}
