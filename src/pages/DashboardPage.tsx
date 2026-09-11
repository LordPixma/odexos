import { Link } from "react-router-dom";
import { useDashboard } from "../lib/queries";
import { useAuth } from "../lib/auth";
import { Avatar, Card, EmptyState, PageLoader, SectionTitle } from "../components/ui";
import { ClockIcon, MapPinIcon } from "../components/icons";
import { ACTIVITY_COLORS, EXPENSE_COLORS } from "../lib/labels";
import {
  formatFullDate,
  formatMoney,
  formatTime,
  relativeDay,
} from "../lib/format";
import {
  ACTIVITY_CATEGORY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  type Activity,
  type Member,
} from "@shared/types";

function StatCard({
  label,
  value,
  sub,
  accent = "#4f46e5",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold text-slate-900" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
}

function ActivityRow({
  activity,
  member,
  showDay,
}: {
  activity: Activity;
  member?: Member;
  showDay?: boolean;
}) {
  const color = ACTIVITY_COLORS[activity.category];
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className="h-9 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
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
          <span className="inline-flex items-center gap-1">
            <ClockIcon />
            {showDay && `${relativeDay(activity.startsAt)}, `}
            {activity.allDay ? "All day" : formatTime(activity.startsAt)}
          </span>
          {activity.location && (
            <span className="inline-flex items-center gap-1">
              <MapPinIcon /> {activity.location}
            </span>
          )}
        </div>
      </div>
      {member && <Avatar name={member.name} color={member.color} size={30} />}
    </div>
  );
}

export default function DashboardPage() {
  const { auth } = useAuth();
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <PageLoader />;

  const memberById = new Map(data.members.map((m) => [m.id, m]));
  const firstName = auth?.member.name.split(" ")[0] ?? "there";
  const topCategoryTotal = data.expenseByCategory[0]?.amountCents ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Good day, {firstName} 👋
        </h1>
        <p className="text-sm text-slate-500">{formatFullDate(new Date().toISOString())}</p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Net worth"
          value={formatMoney(data.finance.netWorthCents, data.currency)}
          sub={`${data.finance.accountCount} account${data.finance.accountCount === 1 ? "" : "s"}`}
          accent={data.finance.netWorthCents >= 0 ? "#0f766e" : "#dc2626"}
        />
        <StatCard
          label="Spent this month"
          value={formatMoney(data.monthSpendCents, data.currency)}
          sub={
            data.expenseByCategory[0]
              ? `Top: ${EXPENSE_CATEGORY_LABELS[data.expenseByCategory[0].category]}`
              : "No expenses yet"
          }
          accent="#b45309"
        />
        <StatCard
          label="Today"
          value={`${data.todayActivities.length}`}
          sub={data.todayActivities.length === 1 ? "activity" : "activities"}
          accent="#0369a1"
        />
        <StatCard
          label="Family"
          value={`${data.members.length}`}
          sub={data.members.length === 1 ? "member" : "members"}
          accent="#4f46e5"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today + upcoming */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <SectionTitle
              title="Today's schedule"
              action={
                <Link to="/activities" className="text-sm font-medium text-brand-600 hover:underline">
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
              <div className="divide-y divide-slate-100">
                {data.todayActivities.map((a) => (
                  <ActivityRow
                    key={a.id}
                    activity={a}
                    member={a.memberId ? memberById.get(a.memberId) : undefined}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle title="Coming up" subtitle="Next 7 days" />
            {data.upcomingActivities.length === 0 ? (
              <EmptyState icon="✨" title="No upcoming plans yet" />
            ) : (
              <div className="divide-y divide-slate-100">
                {data.upcomingActivities.map((a) => (
                  <ActivityRow
                    key={a.id}
                    activity={a}
                    member={a.memberId ? memberById.get(a.memberId) : undefined}
                    showDay
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right rail: budget alerts + finance + spend breakdown */}
        <div className="space-y-6">
          {data.budgetAlerts.length > 0 && (
            <Card className="p-5">
              <SectionTitle
                title="Budget alerts"
                action={
                  <Link to="/budgets" className="text-sm font-medium text-brand-600 hover:underline">
                    Manage
                  </Link>
                }
              />
              <div className="space-y-3">
                {data.budgetAlerts.map((a) => {
                  const color = a.status === "over" ? "#dc2626" : "#b45309";
                  const label = a.category
                    ? EXPENSE_CATEGORY_LABELS[a.category]
                    : "Overall budget";
                  return (
                    <div key={a.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span style={{ color }}>⚠</span> {label}
                        </span>
                        <span className="font-medium" style={{ color }}>
                          {Math.round(a.percent * 100)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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

          <Card className="p-5">
            <SectionTitle
              title="Financial posture"
              action={
                <Link to="/finance" className="text-sm font-medium text-brand-600 hover:underline">
                  Details
                </Link>
              }
            />
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Assets</span>
                <span className="font-semibold text-emerald-600">
                  {formatMoney(data.finance.totalAssetsCents, data.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Liabilities</span>
                <span className="font-semibold text-red-500">
                  {formatMoney(data.finance.totalLiabilitiesCents, data.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="font-medium text-slate-700">Net worth</span>
                <span className="text-lg font-extrabold text-slate-900">
                  {formatMoney(data.finance.netWorthCents, data.currency)}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="This month's spend" subtitle="By category" />
            {data.expenseByCategory.length === 0 ? (
              <EmptyState icon="💷" title="No spending logged" />
            ) : (
              <div className="space-y-3">
                {data.expenseByCategory.map(({ category, amountCents }) => (
                  <div key={category}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-600">
                        {EXPENSE_CATEGORY_LABELS[category]}
                      </span>
                      <span className="font-medium text-slate-800">
                        {formatMoney(amountCents, data.currency)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${topCategoryTotal ? (amountCents / topCategoryTotal) * 100 : 0}%`,
                          backgroundColor: EXPENSE_COLORS[category],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
