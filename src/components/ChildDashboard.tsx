import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useAllowance, useMeritBoard } from "../lib/queries";
import { Card, EmptyState, MemberAvatar, SectionHead } from "./ui";
import EnableNotifications from "./EnableNotifications";
import {
  BroomIcon,
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  StarIcon,
  UsersIcon,
} from "./icons";
import { ACTIVITY_COLORS } from "../lib/labels";
import { formatFullDate, formatMoney, formatTime, relativeDay } from "../lib/format";
import type { ChildDashboardData } from "@shared/types";

/**
 * A child's home screen. Deliberately not the parents' dashboard with the
 * money taken out — what matters to them is what's on today, what they owe the
 * house in chores, and how their week is going.
 */
export default function ChildDashboard({ data }: { data: ChildDashboardData }) {
  const { auth } = useAuth();
  const me = auth?.member;
  const { data: board } = useMeritBoard();
  const { data: allowance } = useAllowance(me?.id);

  const firstName = me?.nickname ?? me?.name.split(" ")[0] ?? "there";
  const memberById = useMemo(
    () => new Map(data.members.map((m) => [m.id, m])),
    [data.members],
  );
  const myTally = board?.tallies.find((t) => t.childId === me?.id);

  const nav = [
    {
      to: "/calendar",
      label: "Calendar",
      icon: <CalendarIcon size={20} />,
      grad: ["#3b82f6", "#22d3ee"] as [string, string],
      stat: "What's coming up",
    },
    {
      to: "/chores",
      label: "Chores",
      icon: <BroomIcon size={20} />,
      grad: ["#a855f7", "#7c3aed"] as [string, string],
      stat: data.choresOpen > 0 ? `${data.choresOpen} to do` : "All caught up",
    },
    {
      to: "/merits",
      label: "Merits",
      icon: <StarIcon size={20} />,
      grad: ["#f59e0b", "#d97706"] as [string, string],
      stat: myTally ? `${myTally.net > 0 ? "+" : ""}${myTally.net} this week` : "This week",
    },
    {
      to: "/allowance",
      label: "My money",
      icon: <StarIcon size={20} />,
      grad: ["#10b981", "#059669"] as [string, string],
      // A balance of zero reads as "you have nothing" when they have in fact
      // earned this week — it just hasn't settled yet. Say whichever is true.
      stat: !allowance
        ? "Balance & pots"
        : allowance.balanceCents > 0
          ? `${formatMoney(allowance.balanceCents, allowance.currency)} to collect`
          : `${formatMoney(allowance.thisWeek.projectedCents, allowance.currency)} so far`,
    },
    {
      to: "/activities",
      label: "Activities",
      icon: <ClockIcon size={20} />,
      grad: ["#0ea5e9", "#2563eb"] as [string, string],
      stat: `${data.todayActivities.length} today`,
    },
    {
      to: "/household",
      label: "Household",
      icon: <ClipboardIcon size={20} />,
      grad: ["#8b5cf6", "#6366f1"] as [string, string],
      stat: "Lists & meals",
    },
    {
      to: "/family",
      label: "Family",
      icon: <UsersIcon size={20} />,
      grad: ["#ec4899", "#8b5cf6"] as [string, string],
      stat: `${data.members.length} of us`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 px-6 py-6 sm:px-8"
        style={{
          backgroundImage:
            "linear-gradient(110deg, #7c3aed 0%, #2563eb 52%, #0f8a5f 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(30rem 30rem at 90% -40%, rgba(255,255,255,0.5), transparent 60%)",
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Hi {firstName}!
            </h1>
            <p className="mt-1 text-sm text-white/75">
              {formatFullDate(new Date().toISOString())} ·{" "}
              {data.choresOpen > 0
                ? `${data.choresOpen} chore${data.choresOpen === 1 ? "" : "s"} to do`
                : "nothing owing"}
            </p>
          </div>
          {allowance && (
            <div className="rounded-2xl bg-white/15 px-4 py-3 text-right backdrop-blur">
              <div className="text-[11px] uppercase tracking-wide text-white/70">
                This week
              </div>
              <div className="font-display text-2xl font-bold text-white">
                {formatMoney(allowance.thisWeek.projectedCents, allowance.currency)}
              </div>
            </div>
          )}
        </div>
      </div>

      <EnableNotifications />

      {/* Where to go */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Explore
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="card card-hover group flex flex-col justify-between p-4"
            >
              <div className="flex items-start justify-between">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${n.grad[0]}, ${n.grad[1]})`,
                  }}
                >
                  {n.icon}
                </span>
                <span className="text-slate-600 transition group-hover:text-slate-300">
                  →
                </span>
              </div>
              <div className="mt-4">
                <div className="font-display text-base font-bold text-white">
                  {n.label}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">{n.stat}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Today */}
        <Card className="p-5">
          <SectionHead
            icon={<CalendarIcon size={16} className="text-white" />}
            tint="#2f74e0"
            title="Today"
            subtitle={
              data.todayActivities.length === 1
                ? "1 thing on"
                : `${data.todayActivities.length} things on`
            }
            action={
              <Link
                to="/calendar"
                className="text-xs font-semibold text-brand-400 hover:text-brand-300"
              >
                Calendar
              </Link>
            }
          />
          {data.todayActivities.length === 0 ? (
            <EmptyState icon="🌤️" title="Nothing on today" />
          ) : (
            <ul className="space-y-2">
              {data.todayActivities.slice(0, 6).map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-xl border border-white/5 bg-surface-2/60 p-3"
                >
                  <span
                    className="mt-1 h-8 w-1 shrink-0 rounded-full"
                    style={{ background: ACTIVITY_COLORS[a.category] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {a.title}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {a.allDay ? "All day" : formatTime(a.startsAt)}
                      {a.location ? ` · ${a.location}` : ""}
                    </div>
                  </div>
                  {a.memberId && memberById.get(a.memberId) && (
                    <MemberAvatar member={memberById.get(a.memberId)!} size={26} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* This week's merits */}
        <Card className="p-5">
          <SectionHead
            icon={<StarIcon size={16} className="text-white" />}
            tint="#e0930f"
            title="My week"
            subtitle="Merits and demerits so far"
            action={
              <Link
                to="/merits"
                className="text-xs font-semibold text-brand-400 hover:text-brand-300"
              >
                All
              </Link>
            }
          />
          {myTally ? (
            <>
              <div className="flex items-center gap-4">
                <div
                  className="font-display text-4xl font-bold tabular-nums"
                  style={{ color: myTally.net >= 0 ? "#34d399" : "#fb7185" }}
                >
                  {myTally.net > 0 ? "+" : ""}
                  {myTally.net}
                </div>
                <div className="text-sm text-slate-400">
                  {myTally.merits} up · {myTally.demerits} down
                  {board && (
                    <div className="text-xs">
                      worth{" "}
                      {formatMoney(
                        Math.abs(myTally.net * board.meritValueCents),
                        board.currency,
                      )}
                    </div>
                  )}
                </div>
              </div>
              {board && board.recent.filter((m) => m.childId === me?.id).length > 0 && (
                <ul className="mt-4 space-y-2">
                  {board.recent
                    .filter((m) => m.childId === me?.id)
                    .slice(0, 4)
                    .map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-surface-2/60 p-2.5"
                      >
                        <span
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                          style={{
                            background: m.value > 0 ? "#34d3991f" : "#fb71851f",
                            color: m.value > 0 ? "#34d399" : "#fb7185",
                          }}
                        >
                          {m.value > 0 ? "+1" : "−1"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-xs text-slate-200">
                            {m.note}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {relativeDay(m.createdAt)}
                          </div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </>
          ) : (
            <EmptyState icon="⭐" title="Nothing yet this week" />
          )}
        </Card>
      </div>

      {/* Coming up */}
      <Card className="p-5">
        <SectionHead
          icon={<ClockIcon size={16} className="text-white" />}
          tint="#0891b2"
          title="Coming up"
          subtitle="Next 7 days"
        />
        {data.upcomingActivities.length === 0 ? (
          <EmptyState icon="✨" title="Nothing planned yet" />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.upcomingActivities.slice(0, 6).map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-xl border border-white/5 bg-surface-2/60 p-3"
              >
                <span
                  className="mt-1 h-8 w-1 shrink-0 rounded-full"
                  style={{ background: ACTIVITY_COLORS[a.category] }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {a.title}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {relativeDay(a.startsAt)}
                    {a.allDay ? "" : ` · ${formatTime(a.startsAt)}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.upcomingBirthdays.length > 0 && (
        <Card className="p-5">
          <SectionHead
            icon={<UsersIcon size={16} className="text-white" />}
            tint="#ec4899"
            title="Birthdays"
            subtitle="Coming up"
          />
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.upcomingBirthdays.map((b) => (
              <li
                key={b.memberId}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-surface-2/60 p-3"
              >
                <span className="text-lg">🎂</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {b.nickname ?? b.name}
                    {b.turning ? ` turns ${b.turning}` : ""}
                  </div>
                  <div className="text-xs text-slate-400">
                    {b.daysUntil === 0
                      ? "Today!"
                      : b.daysUntil === 1
                        ? "Tomorrow"
                        : `in ${b.daysUntil} days`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
