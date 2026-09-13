import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useAdjustAllowance,
  useAllowance,
  useCreatePot,
  useDeletePot,
  useMembers,
  useRecordPayout,
  useUpdateBankBalance,
  useUpdatePot,
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
  SectionHead,
  Select,
  StatTile,
} from "../components/ui";
import { BankIcon, PiggyIcon, PlusIcon, TrashIcon } from "../components/icons";
import { ApiError } from "../lib/api";
import { formatDate, formatMoney } from "../lib/format";
import {
  MAX_SAVINGS_POTS,
  MEMBER_COLORS,
  isParent,
  type LedgerEntry,
  type SavingsPot,
} from "@shared/types";

/** The API takes pounds, as the rest of the app does; it stores pence. */
function toPounds(cents: number): string {
  return (cents / 100).toFixed(2);
}
function pounds(value: string): number {
  return Number(value);
}

export default function AllowancePage() {
  const { auth } = useAuth();
  const params = useParams<{ childId?: string }>();
  const navigate = useNavigate();
  const { data: members } = useMembers();
  const parent = auth ? isParent(auth.member.role) : false;

  const children = (members ?? []).filter((m) => m.role === "child");
  // A child lands on their own page; a parent picks from the children.
  const childId =
    params.childId ??
    (auth?.member.role === "child" ? auth.member.id : children[0]?.id);

  const { data, isLoading, error } = useAllowance(childId);

  if (isLoading) return <PageLoader />;
  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={<PiggyIcon className="text-white" />}
          tint="#0f9d6b"
          title="Allowance"
        />
        <EmptyState
          icon="🐷"
          title={error ? "Can't show that" : "No children yet"}
          description={
            (error as ApiError | null)?.message ??
            "Allowances are for family members with the Child role."
          }
        />
      </div>
    );
  }

  const owed = data.balanceCents;
  const name = data.child.nickname ?? data.child.name;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<PiggyIcon className="text-white" />}
        tint="#0f9d6b"
        title={parent ? `${name}'s allowance` : "My allowance"}
        subtitle="What's owed, what's saved, and how the week is going."
        action={
          parent && children.length > 1 ? (
            <Select
              value={childId}
              onChange={(e) => navigate(`/allowance/${e.target.value}`)}
              className="max-w-[11rem]"
            >
              {children.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.nickname ?? ch.name}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />

      {data.needsBalanceUpdate && (
        <BalancePrompt childId={childId!} currency={data.currency} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={owed < 0 ? "Owed back" : "Balance"}
          value={formatMoney(Math.abs(owed), data.currency)}
          hint={owed < 0 ? "carried forward" : "to be paid"}
          tint={owed < 0 ? "#fb7185" : "#34d399"}
        />
        <StatTile
          label="This week"
          value={formatMoney(data.thisWeek.projectedCents, data.currency)}
          hint={`${data.thisWeek.merits}↑ ${data.thisWeek.demerits}↓`}
          tint="#e0930f"
        />
        <StatTile
          label="In pots"
          value={formatMoney(data.potsTotalCents, data.currency)}
          hint={`${data.pots.length} of ${MAX_SAVINGS_POTS}`}
          tint="#7c5cf5"
        />
        <StatTile
          label="In the bank"
          value={
            data.bankBalanceCents === null
              ? "—"
              : formatMoney(data.bankBalanceCents, data.currency)
          }
          hint={
            data.bankUpdatedAt
              ? `as of ${formatDate(data.bankUpdatedAt)}`
              : "not reported yet"
          }
          tint="#2f74e0"
        />
      </div>

      <Card className="p-5">
        <SectionHead
          icon={<PiggyIcon size={16} className="text-white" />}
          tint="#0f9d6b"
          title="How this week adds up"
        />
        <dl className="space-y-2 text-sm">
          <Row label="Weekly allowance" value={formatMoney(data.allowanceCents, data.currency)} />
          <Row
            label={`Merits (${data.thisWeek.merits} × ${formatMoney(data.meritValueCents, data.currency)})`}
            value={`+${formatMoney(data.thisWeek.merits * data.meritValueCents, data.currency)}`}
            tone="up"
          />
          <Row
            label={`Demerits (${data.thisWeek.demerits} × ${formatMoney(data.meritValueCents, data.currency)})`}
            value={`−${formatMoney(data.thisWeek.demerits * data.meritValueCents, data.currency)}`}
            tone="down"
          />
          <div className="!mt-3 flex items-baseline justify-between border-t border-white/10 pt-3">
            <dt className="text-sm font-semibold text-white">This week's total</dt>
            <dd
              className="font-display text-lg font-bold tabular-nums"
              style={{
                color: data.thisWeek.projectedCents < 0 ? "#fb7185" : "#34d399",
              }}
            >
              {data.thisWeek.projectedCents < 0 ? "−" : ""}
              {formatMoney(Math.abs(data.thisWeek.projectedCents), data.currency)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Settles automatically on Monday morning. A week that ends short
          carries over, so the next one starts from there.
        </p>
      </Card>

      <Pots
        childId={childId!}
        pots={data.pots}
        currency={data.currency}
        defaultColor={data.child.color}
      />

      {parent && (
        <ParentActions childId={childId!} currency={data.currency} balance={owed} />
      )}

      <Card className="p-5">
        <SectionHead
          icon={<BankIcon size={16} className="text-white" />}
          tint="#2f74e0"
          title="History"
          subtitle="Every week, payout and correction"
        />
        {data.ledger.length === 0 ? (
          <EmptyState icon="📒" title="Nothing recorded yet" />
        ) : (
          <ul className="space-y-2">
            {data.ledger.map((e) => (
              <LedgerRow key={e.id} entry={e} currency={data.currency} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd
        className="tabular-nums"
        style={{
          color: tone === "up" ? "#34d399" : tone === "down" ? "#fb7185" : "#e2e8f0",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function LedgerRow({ entry, currency }: { entry: LedgerEntry; currency: string }) {
  const positive = entry.amountCents >= 0;
  const label =
    entry.kind === "weekly"
      ? `Week of ${entry.weekStart ? formatDate(`${entry.weekStart}T00:00:00Z`) : ""}`
      : entry.kind === "payout"
        ? "Paid out"
        : "Adjustment";
  const detail =
    entry.kind === "weekly" && entry.meritCount !== null
      ? `${entry.meritCount}↑ ${entry.demeritCount}↓ on ${formatMoney(entry.baseCents ?? 0, currency)}`
      : entry.note;

  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-surface-2/60 p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-100">{label}</div>
        {detail && (
          <div className="mt-0.5 break-words text-xs text-slate-400">{detail}</div>
        )}
      </div>
      <div
        className="shrink-0 font-display text-sm font-bold tabular-nums"
        style={{ color: positive ? "#34d399" : "#fb7185" }}
      >
        {positive ? "+" : "−"}
        {formatMoney(Math.abs(entry.amountCents), currency)}
      </div>
    </li>
  );
}

/** The weekly nudge, shown until this week's balance has been reported. */
function BalancePrompt({ childId, currency }: { childId: string; currency: string }) {
  const update = useUpdateBankBalance(childId);
  const [value, setValue] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate({ balance: pounds(value) });
  }

  return (
    <Card className="border-accent-500/30 bg-accent-500/[0.07] p-5">
      <SectionHead
        icon={<BankIcon size={16} className="text-white" />}
        tint="#e0930f"
        title="Update your balance"
        subtitle="Your accounts can't connect, so this is the weekly check-in"
      />
      <ErrorBanner message={(update.error as ApiError | null)?.message} />
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[9rem] flex-1">
          <Field label={`Bank balance (${currency})`}>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
              required
            />
          </Field>
        </div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
      <p className="mt-2 text-xs text-slate-400">
        Check your savings pots below are right too.
      </p>
    </Card>
  );
}

function Pots({
  childId,
  pots,
  currency,
  defaultColor,
}: {
  childId: string;
  pots: SavingsPot[];
  currency: string;
  defaultColor: string;
}) {
  const create = useCreatePot(childId);
  const update = useUpdatePot(childId);
  const remove = useDeletePot(childId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SavingsPot | null>(null);
  const [form, setForm] = useState({ name: "", balance: "", target: "", color: defaultColor });

  const full = pots.length >= MAX_SAVINGS_POTS;

  function openAdd() {
    setForm({ name: "", balance: "", target: "", color: defaultColor });
    create.reset();
    setAdding(true);
  }

  function openEdit(pot: SavingsPot) {
    setForm({
      name: pot.name,
      balance: toPounds(pot.balanceCents),
      target: pot.targetCents === null ? "" : toPounds(pot.targetCents),
      color: pot.color,
    });
    update.reset();
    setEditing(pot);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      balance: pounds(form.balance || "0"),
      target: form.target === "" ? null : pounds(form.target),
      color: form.color,
    };
    if (editing) {
      update.mutate({ id: editing.id, ...body }, { onSuccess: () => setEditing(null) });
    } else {
      create.mutate(body, { onSuccess: () => setAdding(false) });
    }
  }

  return (
    <Card className="p-5">
      <SectionHead
        icon={<PiggyIcon size={16} className="text-white" />}
        tint="#7c5cf5"
        title="Savings pots"
        subtitle={`${pots.length} of ${MAX_SAVINGS_POTS} used`}
        action={
          <Button type="button" onClick={openAdd} disabled={full}>
            <PlusIcon size={15} /> New pot
          </Button>
        }
      />
      {pots.length === 0 ? (
        <EmptyState
          icon="🫙"
          title="No pots yet"
          description="Split savings into pots — a bike, a game, a rainy day."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pots.map((pot) => {
            const pct =
              pot.targetCents && pot.targetCents > 0
                ? Math.min(1, pot.balanceCents / pot.targetCents)
                : null;
            return (
              <div
                key={pot.id}
                className="rounded-xl border border-white/5 bg-surface-2/60 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: pot.color }}
                      />
                      <span className="truncate text-sm font-semibold text-white">
                        {pot.name}
                      </span>
                    </div>
                    <div className="mt-1 font-display text-xl font-bold tabular-nums text-white">
                      {formatMoney(pot.balanceCents, currency)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(pot)}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 ring-1 ring-white/10 transition hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${pot.name}"?`)) remove.mutate(pot.id);
                      }}
                      aria-label={`Delete ${pot.name}`}
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
                {pct !== null && (
                  <>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct * 100}%`, background: pot.color }}
                      />
                    </div>
                    <div className="mt-1.5 text-xs text-slate-400">
                      {Math.round(pct * 100)}% of{" "}
                      {formatMoney(pot.targetCents!, currency)}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={adding || Boolean(editing)}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        title={editing ? "Edit pot" : "New savings pot"}
      >
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner
            message={
              ((editing ? update.error : create.error) as ApiError | null)?.message
            }
          />
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="New bike"
              required
              maxLength={60}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Saved (${currency})`}>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                placeholder="0.00"
              />
            </Field>
            <Field label="Goal (optional)">
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
                placeholder="—"
              />
            </Field>
          </div>
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {MEMBER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  aria-label={c}
                  className={`h-7 w-7 rounded-full transition ${
                    form.color === c ? "ring-2 ring-white" : "ring-1 ring-white/20"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending
                ? "Saving…"
                : editing
                  ? "Save pot"
                  : "Create pot"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

/** Paying out and corrections — parents only. */
function ParentActions({
  childId,
  currency,
  balance,
}: {
  childId: string;
  currency: string;
  balance: number;
}) {
  const payout = useRecordPayout(childId);
  const adjust = useAdjustAllowance(childId);
  const [mode, setMode] = useState<"payout" | "adjust" | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function open(next: "payout" | "adjust") {
    setAmount(next === "payout" && balance > 0 ? toPounds(balance) : "");
    setNote("");
    payout.reset();
    adjust.reset();
    setMode(next);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const done = { onSuccess: () => setMode(null) };
    if (mode === "payout") {
      payout.mutate({ amount: pounds(amount), note: note.trim() || undefined }, done);
    } else {
      adjust.mutate({ amount: pounds(amount), note: note.trim() }, done);
    }
  }

  return (
    <Card className="p-5">
      <SectionHead
        icon={<BankIcon size={16} className="text-white" />}
        tint="#e0930f"
        title="Parent actions"
        subtitle="Record a payout, or correct the balance"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => open("payout")} disabled={balance <= 0}>
          Pay out
        </Button>
        <Button type="button" variant="secondary" onClick={() => open("adjust")}>
          Adjustment
        </Button>
      </div>
      {balance <= 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Nothing to pay out right now.
        </p>
      )}

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === "payout" ? "Record a payout" : "Adjust the balance"}
      >
        <form onSubmit={submit} className="space-y-4">
          <ErrorBanner
            message={
              ((mode === "payout" ? payout.error : adjust.error) as ApiError | null)
                ?.message
            }
          />
          <Field
            label={`Amount (${currency})`}
            hint={
              mode === "adjust"
                ? "Use a minus sign to take money off."
                : undefined
            }
          >
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              autoFocus
            />
          </Field>
          <Field label={mode === "adjust" ? "Reason" : "Note (optional)"}>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === "payout" ? "Cash, Saturday" : "Broke a window"
              }
              required={mode === "adjust"}
              maxLength={200}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              disabled={payout.isPending || adjust.isPending}
            >
              {payout.isPending || adjust.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
