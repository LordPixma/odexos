import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  useIssueMerit,
  useParentCentre,
  useRecordInspection,
  useSetAllowanceRate,
  useSetMeritRate,
} from "../lib/queries";
import { useAuth } from "../lib/auth";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
} from "../components/ui";
import {
  BroomIcon,
  CalendarIcon,
  ShieldIcon,
  StarIcon,
} from "../components/icons";
import { ApiError } from "../lib/api";
import { formatMoney } from "../lib/format";
import { isParent, type ChildSummary } from "@shared/types";

const UP = "#34d399";
const DOWN = "#fb7185";

/** The API takes pounds, as the rest of the app does; it stores pence. */
function toPounds(c: number): string {
  return (c / 100).toFixed(2);
}
function pounds(value: string): number {
  return Number(value);
}

export default function ParentCentrePage() {
  const { auth } = useAuth();
  const { data, isLoading, error } = useParentCentre();

  // Children shouldn't even land here; send them somewhere useful instead.
  if (auth && !isParent(auth.member.role)) {
    return <Navigate to="/" replace />;
  }
  if (isLoading) return <PageLoader />;
  if (!data) return <ErrorBanner message={(error as Error)?.message} />;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ShieldIcon className="text-white" />}
        tint="#7c5cf5"
        title="Parent Centre"
        subtitle="Merits, money, rooms and schedules — all in one place."
      />

      <ErrorBanner message={(error as Error)?.message} />

      <RateCard meritValueCents={data.meritValueCents} currency={data.currency} />

      {data.children.length === 0 ? (
        <EmptyState
          icon="👶"
          title="No children yet"
          description="Invite a family member with the Child role to get started."
          action={
            <Link
              to="/family"
              className="text-sm font-semibold text-brand-400 hover:text-brand-300"
            >
              Go to Family
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.children.map((child) => (
            <ChildCard
              key={child.id}
              child={child}
              currency={data.currency}
              meritValueCents={data.meritValueCents}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** What a merit is worth, family-wide. */
function RateCard({
  meritValueCents,
  currency,
}: {
  meritValueCents: number;
  currency: string;
}) {
  const setRate = useSetMeritRate();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(toPounds(meritValueCents));

  function submit(e: FormEvent) {
    e.preventDefault();
    setRate.mutate(pounds(value), { onSuccess: () => setEditing(false) });
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "#e0930f26", color: "#e0930f" }}
        >
          <StarIcon size={16} />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">
            One merit is worth {formatMoney(meritValueCents, currency)}
          </div>
          <div className="text-xs text-slate-400">
            Added on top of each child's weekly allowance.
          </div>
        </div>
      </div>
      <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
        Change
      </Button>

      <Modal open={editing} onClose={() => setEditing(false)} title="Merit value">
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner message={(setRate.error as ApiError | null)?.message} />
          <Field label={`Worth per merit (${currency})`}>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={setRate.isPending}>
              {setRate.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

function ChildCard({
  child,
  currency,
  meritValueCents,
}: {
  child: ChildSummary;
  currency: string;
  meritValueCents: number;
}) {
  const issue = useIssueMerit();
  const inspect = useRecordInspection();
  const setAllowance = useSetAllowanceRate();

  const [meritValue, setMeritValue] = useState<1 | -1 | null>(null);
  const [note, setNote] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [rating, setRating] = useState(child.inspection?.rating ?? 3);
  const [inspectNote, setInspectNote] = useState(child.inspection?.note ?? "");
  const [editingAllowance, setEditingAllowance] = useState(false);
  const [allowance, setAllowance2] = useState(toPounds(child.allowanceCents));

  const name = child.nickname ?? child.name;

  function submitMerit(e: FormEvent) {
    e.preventDefault();
    if (!meritValue) return;
    issue.mutate(
      { childId: child.id, value: meritValue, note: note.trim() },
      { onSuccess: () => setMeritValue(null) },
    );
  }

  function submitInspection(e: FormEvent) {
    e.preventDefault();
    inspect.mutate(
      { childId: child.id, rating, note: inspectNote.trim() || undefined },
      { onSuccess: () => setInspecting(false) },
    );
  }

  function submitAllowance(e: FormEvent) {
    e.preventDefault();
    setAllowance.mutate(
      { id: child.id, allowance: pounds(allowance) },
      { onSuccess: () => setEditingAllowance(false) },
    );
  }

  const weekCents =
    child.allowanceCents + child.thisWeek.net * meritValueCents;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold text-white"
          style={{ background: child.color }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-bold text-white">
            {name}
          </div>
          <div className="text-xs text-slate-400">
            {formatMoney(child.allowanceCents, currency)}/week ·{" "}
            <button
              type="button"
              onClick={() => setEditingAllowance(true)}
              className="font-semibold text-brand-400 hover:text-brand-300"
            >
              change
            </button>
          </div>
        </div>
        <div className="text-right">
          <div
            className="font-display text-2xl font-bold leading-none tabular-nums"
            style={{ color: child.thisWeek.net >= 0 ? UP : DOWN }}
          >
            {child.thisWeek.net > 0 ? "+" : ""}
            {child.thisWeek.net}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">this week</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setNote("");
            issue.reset();
            setMeritValue(1);
          }}
          className="rounded-xl px-3 py-2 text-sm font-semibold transition"
          style={{ background: `${UP}1f`, color: UP }}
        >
          + Merit
        </button>
        <button
          type="button"
          onClick={() => {
            setNote("");
            issue.reset();
            setMeritValue(-1);
          }}
          className="rounded-xl px-3 py-2 text-sm font-semibold transition"
          style={{ background: `${DOWN}1f`, color: DOWN }}
        >
          − Demerit
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Stat label="This week" value={formatMoney(weekCents, currency)} />
        <Stat
          label={child.balanceCents < 0 ? "Owes back" : "Balance"}
          value={formatMoney(Math.abs(child.balanceCents), currency)}
          tone={child.balanceCents < 0 ? "down" : undefined}
        />
        <Stat label="In pots" value={formatMoney(child.potsTotalCents, currency)} />
        <Stat
          label="In the bank"
          value={
            child.bankBalanceCents === null
              ? "—"
              : formatMoney(child.bankBalanceCents, currency)
          }
          tone={child.needsBalanceUpdate ? "warn" : undefined}
        />
      </dl>

      {child.needsBalanceUpdate && (
        <p className="mt-2 text-xs text-accent-300">
          Hasn't reported this week's balance yet.
        </p>
      )}

      <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => {
            setRating(child.inspection?.rating ?? 3);
            setInspectNote(child.inspection?.note ?? "");
            inspect.reset();
            setInspecting(true);
          }}
          className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-surface-2/60 px-3 py-2.5 text-left transition hover:border-white/15"
        >
          <span className="flex items-center gap-2 text-sm text-slate-200">
            <BroomIcon size={15} /> Room inspection
          </span>
          <span className="text-sm">
            {child.inspection ? (
              <Stars rating={child.inspection.rating} />
            ) : (
              <span className="text-xs text-slate-500">Not done</span>
            )}
          </span>
        </button>

        <Link
          to={`/merits/history/${child.id}`}
          className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-surface-2/60 px-3 py-2.5 transition hover:border-white/15"
        >
          <span className="flex items-center gap-2 text-sm text-slate-200">
            <StarIcon size={15} /> Merit history
          </span>
          <span className="text-xs text-slate-400">Open</span>
        </Link>

        <Link
          to={`/chores?assignedTo=${child.id}`}
          className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-surface-2/60 px-3 py-2.5 transition hover:border-white/15"
        >
          <span className="flex items-center gap-2 text-sm text-slate-200">
            <BroomIcon size={15} /> Chores
          </span>
          <span className="text-xs text-slate-400">
            {child.choresOpen > 0 ? `${child.choresOpen} to do` : "All caught up"}
          </span>
        </Link>

        <Link
          to={`/activities?memberId=${child.id}`}
          className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-surface-2/60 px-3 py-2.5 transition hover:border-white/15"
        >
          <span className="flex items-center gap-2 text-sm text-slate-200">
            <CalendarIcon size={15} /> Weekly schedule
          </span>
          <span className="text-xs text-slate-400">Open</span>
        </Link>

        <Link
          to={`/allowance/${child.id}`}
          className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-surface-2/60 px-3 py-2.5 transition hover:border-white/15"
        >
          <span className="flex items-center gap-2 text-sm text-slate-200">
            <StarIcon size={15} /> Allowance &amp; pots
          </span>
          <span className="text-xs text-slate-400">Open</span>
        </Link>
      </div>

      {/* --- Merit --- */}
      <Modal
        open={meritValue !== null}
        onClose={() => setMeritValue(null)}
        title={meritValue === 1 ? `Merit for ${name}` : `Demerit for ${name}`}
      >
        <form onSubmit={submitMerit} className="space-y-4">
          <ErrorBanner message={(issue.error as ApiError | null)?.message} />
          <Field label="What's it for?">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
              maxLength={200}
              autoFocus
              placeholder={
                meritValue === 1 ? "Great report from school" : "Rude at dinner"
              }
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={issue.isPending}>
              {issue.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMeritValue(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- Inspection --- */}
      <Modal
        open={inspecting}
        onClose={() => setInspecting(false)}
        title={`Room inspection — ${name}`}
      >
        <form onSubmit={submitInspection} className="space-y-4">
          <ErrorBanner message={(inspect.error as ApiError | null)?.message} />
          <Field label="Rating">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} out of 5`}
                  aria-pressed={rating === n}
                  className={`flex h-11 flex-1 items-center justify-center rounded-xl text-lg transition ${
                    n <= rating
                      ? "bg-accent-500/20 text-accent-300 ring-1 ring-accent-500/40"
                      : "bg-white/5 text-slate-600 ring-1 ring-white/10"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </Field>
          <Field label="Note (optional)">
            <Input
              value={inspectNote}
              onChange={(e) => setInspectNote(e.target.value)}
              maxLength={300}
              placeholder="Bed made, floor clear, desk still a tip"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={inspect.isPending}>
              {inspect.isPending ? "Saving…" : "Save result"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setInspecting(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- Allowance rate --- */}
      <Modal
        open={editingAllowance}
        onClose={() => setEditingAllowance(false)}
        title={`${name}'s weekly allowance`}
      >
        <form onSubmit={submitAllowance} className="space-y-4">
          <ErrorBanner message={(setAllowance.error as ApiError | null)?.message} />
          <Field
            label={`Per week (${currency})`}
            hint="Merits are added on top of this each week."
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={allowance}
              onChange={(e) => setAllowance2(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={setAllowance.isPending}>
              {setAllowance.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditingAllowance(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "down" | "warn";
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className="font-display text-base font-bold tabular-nums"
        style={{
          color: tone === "down" ? DOWN : tone === "warn" ? "#eeb85f" : "#f1f5f9",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`} className="tabular-nums">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ color: n <= rating ? "#eeb85f" : "#334155" }}>
          ★
        </span>
      ))}
    </span>
  );
}
