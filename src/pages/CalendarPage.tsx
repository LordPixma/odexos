import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useActivities,
  useCalendarSubscription,
  useChores,
  useMembers,
  useRotateCalendarLink,
} from "../lib/queries";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  MemberAvatar,
  PageHeader,
  PageLoader,
  SectionHead,
} from "../components/ui";
import { CalendarIcon, LinkIcon, MapPinIcon } from "../components/icons";
import { ACTIVITY_COLORS } from "../lib/labels";
import { formatTime } from "../lib/format";
import {
  ACTIVITY_CATEGORY_LABELS,
  CHORE_CADENCE_LABELS,
  type Activity,
  type Chore,
  type Member,
} from "@shared/types";

type View = "month" | "week";
type Layer = "plans" | "birthdays" | "chores";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const BIRTHDAY_COLOR = "#ec4899";
const CHORE_COLOR = "#a855f7";

/**
 * One thing on one day, whatever it came from. The grid and the day list both
 * work on these, so plans, birthdays and chores render the same way — and the
 * page shows exactly what the subscribe feed carries.
 */
interface CalItem {
  key: string;
  kind: Layer;
  day: string; // YYYY-MM-DD
  title: string;
  color: string;
  /** ISO start for timed items; null for all-day ones. */
  startsAt: string | null;
  detail: string;
  location?: string | null;
  memberId?: string | null;
}

/** Local YYYY-MM-DD — the key every day cell is bucketed under. */
function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday of the week `d` falls in. */
function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (out.getDay() + 6) % 7; // Sunday(0) → 6
  return addDays(out, -shift);
}

/**
 * The 6×7 grid a month view needs: the Monday on or before the 1st, through
 * enough days to close the last week. Always 42 cells, so the grid doesn't
 * change height as you page through months.
 */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function activityItem(a: Activity): CalItem {
  return {
    key: `a-${a.id}`,
    kind: "plans",
    day: dayKey(new Date(a.startsAt)),
    title: a.title,
    color: ACTIVITY_COLORS[a.category],
    startsAt: a.allDay ? null : a.startsAt,
    detail: ACTIVITY_CATEGORY_LABELS[a.category],
    location: a.location,
    memberId: a.memberId,
  };
}

/**
 * Birthdays land on the same day each year, so they're generated per visible
 * year rather than stored as events. Someone born on 29 February gets the 28th
 * in common years — the alternative is their birthday vanishing three years in four.
 */
function birthdayItems(members: Member[], years: number[]): CalItem[] {
  const out: CalItem[] = [];
  for (const m of members) {
    if (!m.birthday) continue;
    const [birthYear, month, day] = m.birthday.split("-").map(Number);
    for (const year of years) {
      const lastOfMonth = new Date(year, month, 0).getDate();
      const d = new Date(year, month - 1, Math.min(day, lastOfMonth));
      const age = year - birthYear;
      out.push({
        key: `b-${m.id}-${year}`,
        kind: "birthdays",
        day: dayKey(d),
        title: `🎂 ${m.nickname ?? m.name}`,
        color: BIRTHDAY_COLOR,
        startsAt: null,
        detail: age > 0 ? `Turns ${age}` : "Birthday",
        memberId: m.id,
      });
    }
  }
  return out;
}

/** Repeats a chore's due date across the window, mirroring the feed's RRULE. */
function choreItems(chores: Chore[], from: Date, to: Date): CalItem[] {
  const out: CalItem[] = [];
  for (const ch of chores) {
    if (ch.archived) continue;
    const [y, m, d] = ch.dueDate.split("-").map(Number);
    let occ = new Date(y, m - 1, d);
    let n = 0;

    // Wind forward to the window without generating what won't be shown.
    const step = (date: Date): Date => {
      const next = new Date(date);
      if (ch.cadence === "daily") next.setDate(next.getDate() + 1);
      else if (ch.cadence === "weekly") next.setDate(next.getDate() + 7);
      else if (ch.cadence === "monthly") next.setMonth(next.getMonth() + 1);
      else next.setFullYear(next.getFullYear() + 100); // "once" — stop
      return next;
    };
    while (occ < from && n++ < 500) occ = step(occ);

    n = 0;
    while (occ <= to && n++ < 200) {
      out.push({
        key: `c-${ch.id}-${dayKey(occ)}`,
        kind: "chores",
        day: dayKey(occ),
        title: ch.title,
        color: CHORE_COLOR,
        startsAt: null,
        detail: CHORE_CADENCE_LABELS[ch.cadence],
        memberId: ch.assignedTo,
      });
      if (ch.cadence === "once") break;
      occ = step(occ);
    }
  }
  return out;
}

function ItemChip({
  item,
  member,
  showTime,
}: {
  item: CalItem;
  member?: Member;
  showTime: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[11px] leading-tight"
      style={{ background: `${item.color}26`, color: "#e2e8f0" }}
      title={`${item.title}${member ? ` · ${member.name}` : ""}`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: item.color }}
      />
      {item.startsAt && showTime && (
        <span className="shrink-0 tabular-nums text-slate-400">
          {formatTime(item.startsAt)}
        </span>
      )}
      <span className="truncate">{item.title}</span>
    </div>
  );
}

/** The list shown for whichever day is selected. */
function DayDetail({
  date,
  items,
  membersById,
}: {
  date: Date;
  items: CalItem[];
  membersById: Map<string, Member>;
}) {
  return (
    <Card className="min-w-0 p-5">
      <SectionHead
        icon={<CalendarIcon size={16} className="text-white" />}
        tint="#2f74e0"
        title={new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(date)}
        subtitle={items.length === 1 ? "1 thing on" : `${items.length} things on`}
        action={
          <Link
            to="/activities"
            className="text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            Plan
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon="🌤️" title="Nothing planned" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const member = item.memberId
              ? membersById.get(item.memberId)
              : undefined;
            return (
              <li
                key={item.key}
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-surface-2/60 p-3"
              >
                <span
                  className="mt-1 h-8 w-1 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm font-semibold text-white">
                    {item.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                    <span style={{ color: item.color }}>
                      {item.startsAt ? formatTime(item.startsAt) : "All day"}
                    </span>
                    <span>· {item.detail}</span>
                    {item.location && (
                      <span className="flex items-center gap-1">
                        · <MapPinIcon size={12} /> {item.location}
                      </span>
                    )}
                  </div>
                </div>
                {member && <MemberAvatar member={member} size={28} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Copy-to-clipboard subscribe link, with the layer toggles and a reset. */
function SubscribeCard({ layers }: { layers: Record<Layer, boolean> }) {
  const { data, isLoading } = useCalendarSubscription();
  const rotate = useRotateCalendarLink();
  const [copied, setCopied] = useState(false);

  // The feed mirrors whatever the grid is showing.
  const url = useMemo(() => {
    if (!data?.url) return "";
    const off = (Object.keys(layers) as Layer[])
      .filter((k) => !layers[k])
      .map((k) => `${k}=0`);
    return off.length ? `${data.url}?${off.join("&")}` : data.url;
  }, [data?.url, layers]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="min-w-0 p-5">
      <SectionHead
        icon={<LinkIcon size={16} className="text-white" />}
        tint="#7c5cf5"
        title="Subscribe on your phone"
        subtitle="Keeps updating — it's a live feed, not a one-off import"
      />
      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          <p className="text-xs text-slate-400">
            This link carries whatever layers are switched on above.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="input flex-1 truncate font-mono text-xs"
              aria-label="Calendar subscription URL"
            />
            <Button type="button" onClick={copy} className="shrink-0">
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            <span className="text-slate-300">iPhone:</span> Settings → Calendar →
            Accounts → Add Account → Other → Add Subscribed Calendar.{" "}
            <span className="text-slate-300">Google Calendar:</span> Other
            calendars → From URL.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Anyone with this link can read the calendar, so share it only with
            the family.{" "}
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Reset the link? Everyone who has subscribed will need the new one.",
                  )
                ) {
                  rotate.mutate();
                }
              }}
              className="font-semibold text-rose-400 hover:text-rose-300"
            >
              Reset link
            </button>
          </p>
        </>
      )}
    </Card>
  );
}

export default function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [layers, setLayers] = useState<Record<Layer, boolean>>({
    plans: true,
    birthdays: true,
    chores: true,
  });

  const days = useMemo(
    () =>
      view === "month"
        ? monthGrid(anchor)
        : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)),
    [anchor, view],
  );

  // Fetch a month either side of what's shown, so paging doesn't flash empty.
  const range = useMemo(() => {
    const first = days[0];
    const last = days[days.length - 1];
    return {
      from: addDays(first, -35).toISOString(),
      to: addDays(last, 35).toISOString(),
    };
  }, [days]);

  const { data: activities, isLoading, error } = useActivities(range);
  const { data: members } = useMembers();
  const { data: choresData } = useChores();

  const membersById = useMemo(
    () => new Map((members ?? []).map((m) => [m.id, m])),
    [members],
  );

  // Bucket everything under its local day, in one pass over all three sources.
  const byDay = useMemo(() => {
    const first = days[0];
    const last = days[days.length - 1];
    const years = Array.from(
      new Set([first.getFullYear(), last.getFullYear()]),
    );

    const items: CalItem[] = [
      ...(layers.plans ? (activities ?? []).map(activityItem) : []),
      ...(layers.birthdays ? birthdayItems(members ?? [], years) : []),
      ...(layers.chores
        ? choreItems(choresData?.chores ?? [], first, last)
        : []),
    ];

    const map = new Map<string, CalItem[]>();
    for (const item of items) {
      const list = map.get(item.day);
      if (list) list.push(item);
      else map.set(item.day, [item]);
    }
    for (const list of map.values()) {
      list.sort((x, y) => {
        // All-day things sit above timed ones, then chronologically.
        if (!x.startsAt !== !y.startsAt) return x.startsAt ? 1 : -1;
        if (x.startsAt && y.startsAt) return x.startsAt.localeCompare(y.startsAt);
        return x.title.localeCompare(y.title);
      });
    }
    return map;
  }, [activities, members, choresData, layers, days]);

  const todayKey = dayKey(new Date());
  const selectedDate = useMemo(() => {
    const [y, m, d] = selected.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [selected]);

  function step(delta: number) {
    setAnchor((a) =>
      view === "month"
        ? new Date(a.getFullYear(), a.getMonth() + delta, 1)
        : addDays(a, delta * 7),
    );
  }

  const heading = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(view === "month" ? anchor : startOfWeek(anchor));

  const perCell = view === "month" ? 2 : 5;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<CalendarIcon className="text-white" />}
        tint="#2f74e0"
        title="Calendar"
        subtitle="Everything the family has on, in one grid."
        action={
          <div className="flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                  view === v
                    ? "bg-brand-500 text-ink"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      <ErrorBanner message={error ? (error as Error).message : undefined} />

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-white">{heading}</h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {(
                [
                  ["plans", "Plans", "#2f74e0"],
                  ["birthdays", "Birthdays", BIRTHDAY_COLOR],
                  ["chores", "Chores", CHORE_COLOR],
                ] as const
              ).map(([key, label, color]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setLayers((l) => ({ ...l, [key]: !l[key] }))
                  }
                  aria-pressed={layers[key]}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition"
                  style={
                    layers[key]
                      ? {
                          background: `${color}26`,
                          color: "#e2e8f0",
                          boxShadow: `inset 0 0 0 1px ${color}66`,
                        }
                      : { color: "#64748b", boxShadow: "inset 0 0 0 1px #ffffff1a" }
                  }
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: layers[key] ? color : "#475569" }}
                  />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous"
                className="rounded-lg px-2.5 py-1 text-slate-400 ring-1 ring-white/10 transition hover:text-white"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnchor(new Date());
                  setSelected(todayKey);
                }}
                className="rounded-lg px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-white/10 transition hover:text-white"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next"
                className="rounded-lg px-2.5 py-1 text-slate-400 ring-1 ring-white/10 transition hover:text-white"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : (
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500"
              >
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{d[0]}</span>
              </div>
            ))}
            {days.map((d) => {
              const key = dayKey(d);
              const items = byDay.get(key) ?? [];
              const inMonth =
                view === "week" || d.getMonth() === anchor.getMonth();
              const isToday = key === todayKey;
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={`flex min-w-0 flex-col gap-1 rounded-lg p-1.5 text-left align-top ring-1 transition ${
                    view === "month"
                      ? "min-h-[72px] sm:min-h-[92px]"
                      : "min-h-[140px]"
                  } ${
                    isSelected
                      ? "bg-brand-500/10 ring-brand-500/50"
                      : "bg-surface-2/40 ring-white/5 hover:ring-white/15"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                      isToday ? "bg-brand-500 text-ink" : "text-slate-300"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex flex-col gap-0.5 overflow-hidden">
                    {items.slice(0, perCell).map((item) => (
                      <ItemChip
                        key={item.key}
                        item={item}
                        member={
                          item.memberId
                            ? membersById.get(item.memberId)
                            : undefined
                        }
                        showTime={view === "week"}
                      />
                    ))}
                    {items.length > perCell && (
                      <span className="px-1.5 text-[10px] text-slate-500">
                        +{items.length - perCell} more
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <DayDetail
          date={selectedDate}
          items={byDay.get(selected) ?? []}
          membersById={membersById}
        />
        <SubscribeCard layers={layers} />
      </div>
    </div>
  );
}
