import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMeritHistory, useMembers } from "../lib/queries";
import { useAuth } from "../lib/auth";
import {
  Card,
  EmptyState,
  ErrorBanner,
  MemberAvatar,
  PageHeader,
  PageLoader,
  StatTile,
} from "../components/ui";
import { StarIcon } from "../components/icons";
import { formatMoney, relativeDay } from "../lib/format";
import type { MeritWeek } from "@shared/types";

const UP = "#34d399";
const DOWN = "#fb7185";

/** Monday (YYYY-MM-DD) → "Mon 7 Sep". */
function weekLabel(weekStart: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(`${weekStart}T00:00:00Z`));
}

export default function MeritHistoryPage() {
  const { auth } = useAuth();
  const { childId: param } = useParams<{ childId?: string }>();
  const { data: members } = useMembers();
  const [weeks, setWeeks] = useState(12);

  const children = (members ?? []).filter((m) => m.role === "child");
  const childId =
    param ?? (auth?.member.role === "child" ? auth.member.id : children[0]?.id);
  const { data, isLoading, error } = useMeritHistory(childId, weeks);
  const child = children.find((c) => c.id === childId);

  /**
   * Weeks are newest-first. Trailing empty ones are just padding — trim back to
   * the oldest week that actually had something, keeping a few so the list
   * doesn't look truncated. Empty weeks *within* the range stay: "nothing
   * happened that week" is information.
   */
  const visibleWeeks = useMemo(() => {
    const all = data?.weeks ?? [];
    let last = -1;
    all.forEach((w, i) => {
      if (w.merits + w.demerits > 0 || w.settledCents !== null) last = i;
    });
    if (last < 0) return all.slice(0, 4);
    return all.slice(0, Math.max(last + 1, 4));
  }, [data]);
  const active = useMemo(
    () => visibleWeeks.filter((w) => w.merits + w.demerits > 0),
    [visibleWeeks],
  );
  const totals = useMemo(() => {
    let up = 0;
    let down = 0;
    let earned = 0;
    for (const w of data?.weeks ?? []) {
      up += w.merits;
      down += w.demerits;
      if (w.settledCents !== null) earned += w.settledCents;
    }
    return { up, down, earned };
  }, [data]);

  if (isLoading) return <PageLoader />;
  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<StarIcon className="text-white" />}
          tint="#e0930f"
          title="Merit history"
        />
        <ErrorBanner message={(error as Error)?.message} />
        <EmptyState icon="⭐" title="Nothing to show yet" />
      </div>
    );
  }

  const peak = Math.max(
    1,
    ...visibleWeeks.map((w) => Math.max(w.merits, w.demerits)),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<StarIcon className="text-white" />}
        tint="#e0930f"
        title={child ? `${child.nickname ?? child.name}'s history` : "Merit history"}
        subtitle="Week by week, and what each one settled at."
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10">
              {[6, 12, 26].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setWeeks(n)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    weeks === n
                      ? "bg-brand-500 text-ink"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {n}w
                </button>
              ))}
            </div>
            <Link
              to="/merits"
              className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-white/10 transition hover:text-white"
            >
              This week
            </Link>
          </div>
        }
      />

      {/* Switching between children, for parents and siblings alike. */}
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <Link
              key={c.id}
              to={`/merits/history/${c.id}`}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition ${
                c.id === childId
                  ? "bg-white/[0.06] text-white ring-white/20"
                  : "text-slate-400 ring-white/10 hover:text-slate-200"
              }`}
            >
              <MemberAvatar member={c} size={22} />
              {c.nickname ?? c.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Merits" value={String(totals.up)} hint="in this window" tint={UP} />
        <StatTile
          label="Demerits"
          value={String(totals.down)}
          hint="in this window"
          tint={DOWN}
        />
        <StatTile
          label="Settled"
          value={formatMoney(totals.earned, data.currency)}
          hint="paid into the ledger"
          tint="#e0930f"
        />
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No merits in this window"
          description="Weeks appear here once something has been given."
        />
      ) : (
        <Card className="p-5">
          <h2 className="mb-4 font-display text-base font-semibold text-white">
            Week by week
          </h2>
          <ul className="space-y-2">
            {visibleWeeks.map((w) => (
              <WeekRow
                key={w.weekStart}
                week={w}
                peak={peak}
                currency={data.currency}
              />
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-4 font-display text-base font-semibold text-white">
          Everything given
        </h2>
        {data.entries.length === 0 ? (
          <EmptyState icon="📋" title="Nothing in this window" />
        ) : (
          <ul className="space-y-2">
            {data.entries.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-surface-2/60 p-3"
              >
                <span
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                  style={{
                    background: `${m.value > 0 ? UP : DOWN}1f`,
                    color: m.value > 0 ? UP : DOWN,
                  }}
                >
                  {m.value > 0 ? "+1" : "−1"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-sm text-slate-100">{m.note}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    week of {weekLabel(m.weekStart)} · {relativeDay(m.createdAt)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function WeekRow({
  week,
  peak,
  currency,
}: {
  week: MeritWeek;
  peak: number;
  currency: string;
}) {
  const quiet = week.merits + week.demerits === 0;
  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-white/5 p-3 ${
        quiet ? "bg-surface-2/30 opacity-60" : "bg-surface-2/60"
      }`}
    >
      <div className="w-20 shrink-0 text-xs font-semibold text-slate-400">
        {weekLabel(week.weekStart)}
      </div>

      {/* Up and down as opposing bars, so a bad week reads at a glance. */}
      <div className="flex min-w-[8rem] flex-1 items-center gap-1">
        <div className="flex flex-1 justify-end">
          <div
            className="h-2.5 rounded-l-full"
            style={{
              width: `${(week.demerits / peak) * 100}%`,
              background: DOWN,
              minWidth: week.demerits ? 6 : 0,
            }}
          />
        </div>
        <div className="h-4 w-px shrink-0 bg-white/15" />
        <div className="flex flex-1">
          <div
            className="h-2.5 rounded-r-full"
            style={{
              width: `${(week.merits / peak) * 100}%`,
              background: UP,
              minWidth: week.merits ? 6 : 0,
            }}
          />
        </div>
      </div>

      <div
        className="w-10 shrink-0 text-right font-display text-sm font-bold tabular-nums"
        style={{ color: week.net > 0 ? UP : week.net < 0 ? DOWN : "#64748b" }}
      >
        {week.net > 0 ? "+" : ""}
        {week.net}
      </div>

      <div className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-300">
        {week.settledCents === null ? (
          <span className="text-slate-600">—</span>
        ) : (
          formatMoney(week.settledCents, currency)
        )}
      </div>

      <div className="w-14 shrink-0 text-right text-xs">
        {week.inspection ? (
          <span title={week.inspection.note ?? undefined} style={{ color: "#eeb85f" }}>
            {week.inspection.rating}/5 ★
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </div>
    </li>
  );
}
