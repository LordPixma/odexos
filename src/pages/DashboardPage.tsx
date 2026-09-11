import { Link } from "react-router-dom";
import { useDashboard } from "../lib/queries";
import { useAuth } from "../lib/auth";
import { Avatar, Card, EmptyState, PageLoader } from "../components/ui";
import {
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  MapPinIcon,
  ReceiptIcon,
  TargetIcon,
} from "../components/icons";
import { ACTIVITY_COLORS, EXPENSE_COLORS } from "../lib/labels";
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
  type Activity,
  type ExpenseCategory,
  type Member,
} from "@shared/types";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Donut chart (SVG) for spend-by-category
// ---------------------------------------------------------------------------
function Donut({
  slices,
  size = 168,
  stroke = 22,
}: {
  slices: { category: ExpenseCategory; amountCents: number }[];
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.amountCents, 0);
  const cx = size / 2;

  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {/* track */}
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="rgba(0,0,0,0.06)"
        strokeWidth={stroke}
      />
      {total > 0 &&
        slices.map((s) => {
          const frac = s.amountCents / total;
          const len = frac * c;
          const seg = (
            <circle
              key={s.category}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={EXPENSE_COLORS[s.category]}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(len - 2.5, 0.5)} ${c}`}
              strokeDashoffset={-acc}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cx})`}
            />
          );
          acc += len;
          return seg;
        })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Quick action tile
// ---------------------------------------------------------------------------
function QuickAction({
  to,
  icon,
  label,
  hint,
  tint,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  tint: string;
}) {
  return (
    <Link
      to={to}
      className="card card-hover group flex items-center gap-3 p-4"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${tint}1a`, color: tint }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-semibold text-slate-900">{label}</div>
        <div className="truncate text-xs text-slate-500">{hint}</div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Schedule timeline row
// ---------------------------------------------------------------------------
function TimelineRow({
  activity,
  member,
  last,
  showDay,
}: {
  activity: Activity;
  member?: Member;
  last: boolean;
  showDay?: boolean;
}) {
  const color = ACTIVITY_COLORS[activity.category];
  return (
    <div className="flex gap-3">
      <div className="flex w-14 shrink-0 flex-col items-end pt-0.5">
        <span className="text-sm font-semibold tabular-nums text-slate-700">
          {activity.allDay ? "All day" : formatTime(activity.startsAt)}
        </span>
        {showDay && (
          <span className="text-[11px] text-slate-400">
            {relativeDay(activity.startsAt)}
          </span>
        )}
      </div>
      <div className="relative flex flex-col items-center">
        <span
          className="z-10 mt-1.5 h-3 w-3 rounded-full ring-4 ring-white"
          style={{ backgroundColor: color }}
        />
        {!last && <span className="w-px flex-1 bg-slate-200" />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "pb-0" : "pb-5"}`}>
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-slate-900">
            {activity.title}
          </span>
          <span
            className="chip shrink-0"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            {ACTIVITY_CATEGORY_LABELS[activity.category]}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {activity.location && (
            <span className="inline-flex items-center gap-1">
              <MapPinIcon size={13} /> {activity.location}
            </span>
          )}
          {member && (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={member.name} color={member.color} size={18} />
              {member.name.split(" ")[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CardHead({
  icon,
  tint,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${tint}1a`, color: tint }}
        >
          {icon}
        </span>
        <div>
          <h2 className="font-display text-base font-semibold leading-tight text-slate-900">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export default function DashboardPage() {
  const { auth } = useAuth();
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <PageLoader />;

  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const firstName = auth?.member.name.split(" ")[0] ?? "there";
  const spendTotal = data.expenseByCategory.reduce((s, x) => s + x.amountCents, 0);
  const topCats = data.expenseByCategory.slice(0, 6);
  const shownMembers = data.members.slice(0, 6);
  const extraMembers = data.members.length - shownMembers.length;

  return (
    <div className="space-y-6">
      {/* ---- Hero banner ---- */}
      <div
        className="relative overflow-hidden rounded-3xl px-6 py-7 text-white shadow-lift sm:px-8"
        style={{
          backgroundColor: "#0c6e4d",
          backgroundImage:
            "radial-gradient(30rem 30rem at 8% -20%, rgba(67,190,139,0.55), transparent 60%), radial-gradient(26rem 26rem at 108% 130%, rgba(233,162,52,0.4), transparent 60%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-white/70">
              {formatFullDate(new Date().toISOString())}
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-[2rem]">
              {greeting()}, {firstName} 👋
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-white/80">
              {data.todayActivities.length > 0
                ? `You have ${data.todayActivities.length} thing${
                    data.todayActivities.length === 1 ? "" : "s"
                  } on today across ${data.family.name}.`
                : `Nothing scheduled today — a calm day for ${data.family.name}.`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2.5">
              {shownMembers.map((m) => (
                <span key={m.id} className="rounded-full ring-2 ring-white/80">
                  <Avatar name={m.name} color={m.color} size={38} />
                </span>
              ))}
              {extraMembers > 0 && (
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white/20 text-xs font-semibold ring-2 ring-white/80 backdrop-blur">
                  +{extraMembers}
                </span>
              )}
            </div>
            <Link
              to="/family"
              className="hidden rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/25 sm:block"
            >
              Family
            </Link>
          </div>
        </div>
      </div>

      {/* ---- Quick actions ---- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <QuickAction
          to="/activities"
          icon={<CalendarIcon />}
          label="Add activity"
          hint="School run, club, plan"
          tint="#2f74e0"
        />
        <QuickAction
          to="/expenses"
          icon={<ReceiptIcon />}
          label="Log expense"
          hint="Track family spend"
          tint="#0f9d6b"
        />
        <QuickAction
          to="/household"
          icon={<ClipboardIcon />}
          label="Lists & meals"
          hint="Plan the week"
          tint="#7c5cf5"
        />
        <QuickAction
          to="/budgets"
          icon={<TargetIcon />}
          label="Budgets"
          hint="Stay on target"
          tint="#d9841a"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---- Left: finances + schedule ---- */}
        <div className="space-y-6 lg:col-span-2">
          {/* Finances */}
          <Card className="p-5">
            <CardHead
              icon={<ReceiptIcon size={18} />}
              tint="#0f8a5f"
              title="Finances"
              subtitle="This month"
              action={
                <Link
                  to="/finance"
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Details
                </Link>
              }
            />
            <div className="grid items-center gap-6 sm:grid-cols-[auto,1fr]">
              <div className="relative mx-auto">
                <Donut slices={topCats} />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Spent
                  </span>
                  <span className="font-display text-xl font-bold text-slate-900">
                    {formatMoneyCompact(data.monthSpendCents, data.currency)}
                  </span>
                  {data.monthIncomeCents > 0 && (
                    <span className="mt-0.5 text-[11px] font-medium text-emerald-600">
                      +{formatMoneyCompact(data.monthIncomeCents, data.currency)} in
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {topCats.length === 0 ? (
                  <EmptyState icon="💷" title="No spending logged yet" />
                ) : (
                  topCats.map(({ category, amountCents }) => (
                    <div key={category} className="flex items-center gap-2.5 text-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: EXPENSE_COLORS[category] }}
                      />
                      <span className="flex-1 text-slate-600">
                        {EXPENSE_CATEGORY_LABELS[category]}
                      </span>
                      <span className="font-medium tabular-nums text-slate-800">
                        {formatMoney(amountCents, data.currency)}
                      </span>
                      <span className="w-9 text-right text-xs tabular-nums text-slate-400">
                        {spendTotal
                          ? Math.round((amountCents / spendTotal) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Posture strip */}
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-black/[0.06] pt-4">
              {[
                { label: "Assets", value: data.finance.totalAssetsCents, color: "#0f9d6b" },
                { label: "Liabilities", value: data.finance.totalLiabilitiesCents, color: "#e5484d" },
                { label: "Net worth", value: data.finance.netWorthCents, color: data.finance.netWorthCents >= 0 ? "#0f8a5f" : "#e5484d" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {s.label}
                  </div>
                  <div
                    className="font-display text-lg font-bold tabular-nums"
                    style={{ color: s.color }}
                  >
                    {formatMoneyCompact(s.value, data.currency)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Today's schedule */}
          <Card className="p-5">
            <CardHead
              icon={<CalendarIcon size={18} />}
              tint="#2f74e0"
              title="Today's schedule"
              subtitle={formatFullDate(new Date().toISOString())}
              action={
                <Link
                  to="/activities"
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  View all
                </Link>
              }
            />
            {data.todayActivities.length === 0 ? (
              <EmptyState
                icon="🗓️"
                title="Nothing on today"
                description="Enjoy the quiet — or add something from the Activities tab."
              />
            ) : (
              <div>
                {data.todayActivities.map((a, i) => (
                  <TimelineRow
                    key={a.id}
                    activity={a}
                    member={a.memberId ? memberById.get(a.memberId) : undefined}
                    last={i === data.todayActivities.length - 1}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ---- Right rail ---- */}
        <div className="space-y-6">
          {/* At a glance */}
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              label="Today"
              value={`${data.todayActivities.length}`}
              hint={data.todayActivities.length === 1 ? "activity" : "activities"}
              tint="#2f74e0"
            />
            <MiniStat
              label="Next 7 days"
              value={`${data.upcomingActivities.length}`}
              hint="upcoming"
              tint="#7c5cf5"
            />
            <MiniStat
              label="Family"
              value={`${data.members.length}`}
              hint={data.members.length === 1 ? "member" : "members"}
              tint="#0f8a5f"
            />
            <MiniStat
              label="Accounts"
              value={`${data.finance.accountCount}`}
              hint="linked"
              tint="#d9841a"
            />
          </div>

          {/* Budget alerts */}
          {data.budgetAlerts.length > 0 && (
            <Card className="p-5">
              <CardHead
                icon={<TargetIcon size={18} />}
                tint="#e0930f"
                title="Budget alerts"
                action={
                  <Link
                    to="/budgets"
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Manage
                  </Link>
                }
              />
              <div className="space-y-3">
                {data.budgetAlerts.map((a) => {
                  const color = a.status === "over" ? "#e5484d" : "#e0930f";
                  const label = a.category
                    ? EXPENSE_CATEGORY_LABELS[a.category]
                    : "Overall budget";
                  return (
                    <div key={a.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-slate-700">{label}</span>
                        <span className="font-semibold tabular-nums" style={{ color }}>
                          {Math.round(a.percent * 100)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-sand-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(a.percent, 1) * 100}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatMoney(a.spentCents, data.currency)} of{" "}
                        {formatMoney(a.amountCents, data.currency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Coming up */}
          <Card className="p-5">
            <CardHead
              icon={<ClockIcon size={18} />}
              tint="#7c5cf5"
              title="Coming up"
              subtitle="Next 7 days"
            />
            {data.upcomingActivities.length === 0 ? (
              <EmptyState icon="✨" title="No upcoming plans yet" />
            ) : (
              <div className="space-y-3">
                {data.upcomingActivities.slice(0, 5).map((a) => {
                  const color = ACTIVITY_COLORS[a.category];
                  const member = a.memberId ? memberById.get(a.memberId) : undefined;
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <span
                        className="h-9 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {a.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          {relativeDay(a.startsAt)}
                          {!a.allDay && ` · ${formatTime(a.startsAt)}`}
                        </div>
                      </div>
                      {member && (
                        <Avatar name={member.name} color={member.color} size={26} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Recent activity */}
          {data.recentTransactions.length > 0 && (
            <Card className="p-5">
              <CardHead
                icon={<ReceiptIcon size={18} />}
                tint="#0f8a5f"
                title="Recent activity"
                subtitle="From your banks"
                action={
                  <Link
                    to="/transactions"
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    All
                  </Link>
                }
              />
              <div className="space-y-1">
                {data.recentTransactions.slice(0, 5).map((t) => {
                  const credit = t.direction === "credit";
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-1.5 py-2 transition hover:bg-sand-100"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800">
                          {t.merchant || t.description}
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatDate(t.date)}
                        </div>
                      </div>
                      <div
                        className="shrink-0 text-sm font-semibold tabular-nums"
                        style={{ color: credit ? "#0f9d6b" : "#1c2b24" }}
                      >
                        {credit ? "+" : "−"}
                        {formatMoney(Math.abs(t.amountCents), t.currency)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  tint,
}: {
  label: string;
  value: string;
  hint: string;
  tint: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-bold" style={{ color: tint }}>
          {value}
        </span>
        <span className="text-xs text-slate-500">{hint}</span>
      </div>
    </Card>
  );
}
