import { Link } from "react-router-dom";
import { useDashboard } from "../lib/queries";
import { useAuth } from "../lib/auth";
import { Card, EmptyState, MemberAvatar, PageLoader } from "../components/ui";
import {
  CalendarIcon,
  ChartIcon,
  ClipboardIcon,
  ReceiptIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
} from "../components/icons";
import { ACTIVITY_COLORS } from "../lib/labels";
import {
  formatDate,
  formatFullDate,
  formatMoney,
  formatMoneyCompact,
  formatTime,
  relativeDay,
} from "../lib/format";
import {
  ACTIVITY_CATEGORY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  type BudgetProgress,
  type DailySpend,
} from "@shared/types";

const STATUS_RING: Record<string, [string, string]> = {
  ok: ["#34d399", "#059669"],
  warning: ["#fbbf24", "#d97706"],
  over: ["#fb7185", "#e11d48"],
};

// ---------------------------------------------------------------------------
// Progress ring
// ---------------------------------------------------------------------------
let ringSeq = 0;
function ProgressRing({
  percent,
  from,
  to,
  size = 96,
  stroke = 9,
  center,
}: {
  percent: number;
  from: string;
  to: string;
  size?: number;
  stroke?: number;
  center: string;
}) {
  const id = `ring-${ringSeq++}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(percent, 1));
  const cx = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${p * c} ${c}`}
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-white font-display text-[15px] font-bold"
      >
        {center}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Area chart (spend + income over 14 days)
// ---------------------------------------------------------------------------
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

function SpendArea({ trend }: { trend: DailySpend[] }) {
  const W = 320;
  const H = 120;
  const pad = 10;
  const max = Math.max(
    1,
    ...trend.map((d) => Math.max(d.spendCents, d.incomeCents)),
  );
  const xy = (v: number, i: number): [number, number] => [
    trend.length > 1 ? (i / (trend.length - 1)) * W : W / 2,
    H - pad - (v / max) * (H - 2 * pad),
  ];
  const spendPts = trend.map((d, i) => xy(d.spendCents, i));
  const incomePts = trend.map((d, i) => xy(d.incomeCents, i));
  const spendLine = smoothPath(spendPts);
  const incomeLine = smoothPath(incomePts);
  const spendArea = `${spendLine} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-28 w-full"
    >
      <defs>
        <linearGradient id="spend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spend-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d={spendArea} fill="url(#spend-fill)" />
      <path
        d={incomeLine}
        fill="none"
        stroke="#34d399"
        strokeWidth={2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
      <path
        d={spendLine}
        fill="none"
        stroke="url(#spend-line)"
        strokeWidth={2.5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Section nav card (the dashboard is the menu)
// ---------------------------------------------------------------------------
function NavCard({
  to,
  label,
  stat,
  icon,
  grad,
}: {
  to: string;
  label: string;
  stat: string;
  icon: React.ReactNode;
  grad: [string, string];
}) {
  return (
    <Link
      to={to}
      className="card card-hover group relative flex flex-col gap-3 p-4"
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]"
        style={{ backgroundImage: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})` }}
      >
        {icon}
      </span>
      <div>
        <div className="font-display text-sm font-semibold text-white">{label}</div>
        <div className="truncate text-xs text-slate-400">{stat}</div>
      </div>
      <span className="absolute right-3.5 top-3.5 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-200">
        →
      </span>
    </Link>
  );
}

function CardHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-base font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ringColors(b: BudgetProgress): [string, string] {
  return STATUS_RING[b.status] ?? STATUS_RING.ok;
}

export default function DashboardPage() {
  const { auth } = useAuth();
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <PageLoader />;

  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const firstName = auth?.member.name.split(" ")[0] ?? "there";
  const shownMembers = data.members.slice(0, 5);
  const extraMembers = data.members.length - shownMembers.length;

  const incomeVsSpend =
    data.monthIncomeCents > 0
      ? Math.min(1, data.monthSpendCents / data.monthIncomeCents)
      : data.monthSpendCents > 0
        ? 1
        : 0;

  // Budget rings: top 3 category budgets by usage; fall back to spend mix.
  const ringBudgets = [...data.budgets]
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);

  // Family feed: recent logged expenses + bank transactions, newest first.
  const feedItems = [
    ...data.recentExpenses.map((e) => ({
      key: `e-${e.id}`,
      date: e.spentAt,
      who: e.paidBy ? memberById.get(e.paidBy) : undefined,
      verb: "logged",
      label: e.description,
      amountCents: -e.amountCents,
      currency: e.currency,
    })),
    ...data.recentTransactions.map((t) => ({
      key: `t-${t.id}`,
      date: t.date,
      who: undefined,
      verb: t.direction === "credit" ? "received" : "spent at",
      label: t.merchant || t.description,
      amountCents:
        t.direction === "credit" ? Math.abs(t.amountCents) : -Math.abs(t.amountCents),
      currency: t.currency,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6);

  // Section nav cards (replace the old sidebar menu).
  const alertsCount = data.budgetAlerts.length;
  const memberCount = data.members.length;
  const navItems: {
    to: string;
    label: string;
    stat: string;
    icon: React.ReactNode;
    grad: [string, string];
  }[] = [
    {
      to: "/activities",
      label: "Activities",
      icon: <CalendarIcon size={20} />,
      grad: ["#3b82f6", "#22d3ee"],
      stat: `${data.todayActivities.length} today · ${data.upcomingActivities.length} soon`,
    },
    {
      to: "/household",
      label: "Household",
      icon: <ClipboardIcon size={20} />,
      grad: ["#8b5cf6", "#6366f1"],
      stat: "Lists & meal plan",
    },
    {
      to: "/expenses",
      label: "Expenses",
      icon: <WalletIcon size={20} />,
      grad: ["#10b981", "#059669"],
      stat: `${formatMoneyCompact(data.monthSpendCents, data.currency)} this month`,
    },
    {
      to: "/transactions",
      label: "Transactions",
      icon: <ReceiptIcon size={20} />,
      grad: ["#06b6d4", "#0891b2"],
      stat: "Bank activity",
    },
    {
      to: "/budgets",
      label: "Budgets",
      icon: <TargetIcon size={20} />,
      grad: ["#f59e0b", "#d97706"],
      stat: alertsCount > 0 ? `${alertsCount} alert${alertsCount > 1 ? "s" : ""}` : "On track",
    },
    {
      to: "/finance",
      label: "Finance",
      icon: <ChartIcon size={20} />,
      grad: ["#34d399", "#10b981"],
      stat: `${formatMoneyCompact(data.finance.netWorthCents, data.currency)} net worth`,
    },
    {
      to: "/family",
      label: "Family",
      icon: <UsersIcon size={20} />,
      grad: ["#ec4899", "#8b5cf6"],
      stat: `${memberCount} member${memberCount === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ---- Gradient welcome hero ---- */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 px-6 py-6 sm:px-8"
        style={{
          backgroundImage:
            "linear-gradient(110deg, #1d4ed8 0%, #0e7490 48%, #0f8a5f 100%)",
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
              Welcome back, {firstName}!
            </h1>
            <p className="mt-1 text-sm text-white/75">
              {formatFullDate(new Date().toISOString())} ·{" "}
              {data.todayActivities.length > 0
                ? `${data.todayActivities.length} on today`
                : "clear today"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2.5">
              {shownMembers.map((m) => (
                <span key={m.id} className="rounded-full ring-2 ring-white/40">
                  <MemberAvatar member={m} size={38} />
                </span>
              ))}
              {extraMembers > 0 && (
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/20 text-xs font-semibold text-white ring-2 ring-white/40 backdrop-blur">
                  +{extraMembers}
                </span>
              )}
            </div>
            <Link
              to="/family"
              className="hidden rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25 sm:block"
            >
              Family
            </Link>
          </div>
        </div>
      </div>

      {/* ---- Section cards (the menu) ---- */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Explore
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {navItems.map((n) => (
            <NavCard key={n.to} {...n} />
          ))}
        </div>
      </div>

      {/* ---- Highlights: finances / budgets rings / today ---- */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Finances overview */}
        <Card className="p-5">
          <CardHead
            title="Family finances"
            subtitle="This month"
            action={
              <Link to="/finance" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
                Details
              </Link>
            }
          />
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Net worth
              </div>
              <div className="font-display text-3xl font-bold text-white">
                {formatMoney(data.finance.netWorthCents, data.currency)}
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="text-slate-400">Spent vs in</div>
              <div className="font-semibold text-slate-200">
                {formatMoneyCompact(data.monthSpendCents, data.currency)}
                <span className="text-slate-500">
                  {" "}
                  / {formatMoneyCompact(data.monthIncomeCents, data.currency)}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-400"
              style={{ width: `${incomeVsSpend * 100}%` }}
            />
          </div>

          <div className="mt-3">
            <SpendArea trend={data.spendTrend} />
          </div>

          <div className="mt-3 space-y-1 border-t border-white/[0.07] pt-3">
            {(data.recentTransactions.length > 0
              ? data.recentTransactions.slice(0, 3).map((t) => ({
                  key: t.id,
                  label: t.merchant || t.description,
                  sub: formatDate(t.date),
                  amount: `${t.direction === "credit" ? "+" : "−"}${formatMoney(Math.abs(t.amountCents), t.currency)}`,
                  color: t.direction === "credit" ? "#34d399" : "#f8fafc",
                }))
              : data.expenseByCategory.slice(0, 3).map((e) => ({
                  key: e.category,
                  label: EXPENSE_CATEGORY_LABELS[e.category],
                  sub: "this month",
                  amount: `−${formatMoney(e.amountCents, data.currency)}`,
                  color: "#f8fafc",
                }))
            ).map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 py-1">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-200">
                    {row.label}
                  </div>
                  <div className="text-[11px] text-slate-500">{row.sub}</div>
                </div>
                <span
                  className="shrink-0 text-sm font-semibold tabular-nums"
                  style={{ color: row.color }}
                >
                  {row.amount}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Budget rings */}
        <Card className="p-5">
          <CardHead
            title="Budgets"
            subtitle="Used this month"
            action={
              <Link to="/budgets" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
                Manage
              </Link>
            }
          />
          {ringBudgets.length === 0 ? (
            <EmptyState icon="🎯" title="No budgets set" />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {ringBudgets.map((b) => {
                const [from, to] = ringColors(b);
                return (
                  <div key={b.id} className="flex flex-col items-center text-center">
                    <ProgressRing
                      percent={b.percent}
                      from={from}
                      to={to}
                      center={`${Math.round(b.percent * 100)}%`}
                    />
                    <div className="mt-1.5 truncate text-xs font-medium text-slate-200">
                      {b.category ? EXPENSE_CATEGORY_LABELS[b.category] : "Overall"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formatMoneyCompact(b.spentCents, data.currency)} /{" "}
                      {formatMoneyCompact(b.amountCents, data.currency)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {data.budgetAlerts.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-white/[0.07] pt-3">
              {data.budgetAlerts.slice(0, 2).map((a) => {
                const color = a.status === "over" ? "#fb7185" : "#fbbf24";
                return (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <span style={{ color }}>⚠</span>
                    <span className="text-slate-300">
                      {a.category ? EXPENSE_CATEGORY_LABELS[a.category] : "Overall"}{" "}
                      at {Math.round(a.percent * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Today's schedule */}
        <Card className="p-5">
          <CardHead
            title="Today"
            subtitle={`${data.todayActivities.length} scheduled`}
            action={
              <Link to="/activities" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
                All
              </Link>
            }
          />
          {data.todayActivities.length === 0 ? (
            <EmptyState icon="🗓️" title="Nothing on today" />
          ) : (
            <div className="space-y-3">
              {data.todayActivities.slice(0, 5).map((a) => {
                const color = ACTIVITY_COLORS[a.category];
                const member = a.memberId ? memberById.get(a.memberId) : undefined;
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold tabular-nums text-white"
                      style={{ backgroundColor: `${color}2e`, color }}
                    >
                      {a.allDay ? "—" : formatTime(a.startsAt).replace(/\s?[AP]M/i, "")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-100">
                        {a.title}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {ACTIVITY_CATEGORY_LABELS[a.category]}
                        {a.location ? ` · ${a.location}` : ""}
                      </div>
                    </div>
                    {member && <MemberAvatar member={member} size={24} />}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ---- Bottom row: upcoming events / family feed ---- */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Coming up */}
        <Card className="p-5 lg:col-span-2">
          <CardHead
            title="Upcoming family events"
            subtitle="Next 7 days"
            action={
              <Link to="/activities" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
                Calendar
              </Link>
            }
          />
          {data.upcomingActivities.length === 0 ? (
            <EmptyState icon="✨" title="No upcoming plans yet" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {data.upcomingActivities.slice(0, 6).map((a) => {
                const color = ACTIVITY_COLORS[a.category];
                const member = a.memberId ? memberById.get(a.memberId) : undefined;
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
                  >
                    <span
                      className="h-9 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-100">
                        {a.title}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {relativeDay(a.startsAt)}
                        {!a.allDay && ` · ${formatTime(a.startsAt)}`}
                      </div>
                    </div>
                    {member && <MemberAvatar member={member} size={24} />}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Birthdays */}
        {data.upcomingBirthdays.length > 0 && (
          <Card className="p-5">
            <CardHead title="Birthdays" subtitle="Coming up" />
            <div className="space-y-3">
              {data.upcomingBirthdays.map((b) => {
                const today = b.daysUntil === 0;
                return (
                  <div key={b.memberId} className="flex items-center gap-3">
                    <MemberAvatar
                      member={{
                        id: b.memberId,
                        name: b.name,
                        color: b.color,
                        avatarVersion: b.avatarVersion,
                      }}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-100">
                        {b.nickname || b.name}
                        {b.turning !== null && (
                          <span className="text-slate-400"> turns {b.turning}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatDate(`${b.date}T12:00:00Z`)}
                      </div>
                    </div>
                    <span
                      className={`chip shrink-0 ${
                        today
                          ? "bg-accent-400/20 text-accent-300"
                          : "bg-white/[0.06] text-slate-400"
                      }`}
                    >
                      {today
                        ? "🎂 Today"
                        : b.daysUntil === 1
                          ? "Tomorrow"
                          : `${b.daysUntil}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Family feed */}
        <Card className="p-5">
          <CardHead title="Family feed" subtitle="Recent activity" />
          {feedItems.length === 0 ? (
            <EmptyState icon="📡" title="No recent activity" />
          ) : (
            <div className="space-y-3">
              {feedItems.map((item) => {
                const credit = item.amountCents > 0;
                return (
                  <div key={item.key} className="flex items-start gap-3">
                    {item.who ? (
                      <MemberAvatar member={item.who} size={30} />
                    ) : (
                      <span
                        className="mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs"
                        style={{
                          backgroundColor: credit
                            ? "rgba(52,211,153,0.16)"
                            : "rgba(148,163,184,0.14)",
                        }}
                      >
                        {credit ? "💷" : "🧾"}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-300">
                        {item.who && (
                          <span className="font-semibold text-slate-100">
                            {item.who.name.split(" ")[0]}{" "}
                          </span>
                        )}
                        {item.verb}{" "}
                        <span className="font-medium text-slate-100">{item.label}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatDate(item.date)}
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-sm font-semibold tabular-nums"
                      style={{ color: credit ? "#34d399" : "#e2e8f0" }}
                    >
                      {credit ? "+" : "−"}
                      {formatMoney(Math.abs(item.amountCents), item.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
