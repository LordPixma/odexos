import { useMemo, useState, type FormEvent } from "react";
import {
  useBudgets,
  useCreateBudget,
  useDeleteBudget,
  useUpdateBudget,
} from "../lib/queries";
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
  Select,
} from "../components/ui";
import { EditIcon, PlusIcon, TargetIcon, TrashIcon } from "../components/icons";
import { formatMoney, todayISODate } from "../lib/format";
import { ApiError } from "../lib/api";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type BudgetCategory,
  type BudgetProgress,
  type BudgetStatus,
} from "@shared/types";

const OVERALL = "__overall__";

const STATUS: Record<BudgetStatus, { color: string; label: string }> = {
  ok: { color: "#10b981", label: "On track" },
  warning: { color: "#f59e0b", label: "Approaching limit" },
  over: { color: "#f43f5e", label: "Over budget" },
};

function currentMonth(): string {
  return todayISODate().slice(0, 7);
}

function budgetLabel(category: BudgetCategory): string {
  return category ? EXPENSE_CATEGORY_LABELS[category] : "Overall budget";
}

function BudgetBar({
  bp,
  currency,
  onEdit,
  onDelete,
  emphasise,
}: {
  bp: BudgetProgress;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
  emphasise?: boolean;
}) {
  const s = STATUS[bp.status];
  const pct = Math.min(bp.percent, 1) * 100;
  const over = bp.remainingCents < 0;
  return (
    <div className="group p-4">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`text-white ${emphasise ? "font-bold" : "font-medium"}`}>
            {budgetLabel(bp.category)}
          </span>
          <span
            className="chip"
            style={{ backgroundColor: `${s.color}1a`, color: s.color }}
          >
            {Math.round(bp.percent * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">
            <span className="font-semibold text-white">
              {formatMoney(bp.spentCents, currency)}
            </span>{" "}
            / {formatMoney(bp.amountCents, currency)}
          </span>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={onEdit}
              className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
              aria-label="Edit"
            >
              <EditIcon />
            </button>
            <button
              onClick={onDelete}
              className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
              aria-label="Delete"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: s.color }}
        />
      </div>
      <div className="mt-1 text-xs" style={{ color: over ? "#dc2626" : "#64748b" }}>
        {over
          ? `${formatMoney(Math.abs(bp.remainingCents), currency)} over budget`
          : `${formatMoney(bp.remainingCents, currency)} left`}
      </div>
    </div>
  );
}

export default function BudgetsPage() {
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading } = useBudgets(month);

  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();
  const error =
    (create.error as ApiError | null)?.message ??
    (update.error as ApiError | null)?.message;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetProgress | null>(null);
  const [form, setForm] = useState({ category: OVERALL, amount: "" });

  const currency = data?.currency ?? "GBP";
  const categories = data?.categories ?? [];
  const overall = data?.overall ?? null;
  const alerts = data?.alerts ?? [];

  const availableCategories = useMemo(() => {
    const taken = new Set(categories.map((c) => c.category));
    return EXPENSE_CATEGORIES.filter((c) => !taken.has(c));
  }, [categories]);
  const canAddOverall = !overall;
  const hasAny = overall !== null || categories.length > 0;

  function openCreate() {
    const defaultCat = canAddOverall
      ? OVERALL
      : (availableCategories[0] ?? OVERALL);
    setEditing(null);
    setForm({ category: defaultCat, amount: "" });
    create.reset();
    update.reset();
    setModalOpen(true);
  }
  function openEdit(bp: BudgetProgress) {
    setEditing(bp);
    setForm({
      category: bp.category ?? OVERALL,
      amount: (bp.amountCents / 100).toString(),
    });
    create.reset();
    update.reset();
    setModalOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    const onDone = { onSuccess: () => setModalOpen(false) };
    if (editing) {
      update.mutate({ id: editing.id, amount }, onDone);
    } else {
      create.mutate(
        { category: form.category === OVERALL ? null : form.category, amount },
        onDone,
      );
    }
  }

  const nothingToAdd = !canAddOverall && availableCategories.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<TargetIcon />}
        tint="#d9841a"
        title="Budgets"
        subtitle="Monthly limits by category, tracked against expenses and bank spend."
        action={
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
            />
            <Button onClick={openCreate} disabled={nothingToAdd}>
              <PlusIcon /> Set budget
            </Button>
          </div>
        }
      />

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => {
            const s = STATUS[a.status];
            const over = a.remainingCents < 0;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm"
                style={{ borderColor: `${s.color}55`, backgroundColor: `${s.color}12` }}
              >
                <span style={{ color: s.color }}>⚠</span>
                <span className="text-slate-200">
                  <span className="font-semibold">{budgetLabel(a.category)}</span>{" "}
                  {over ? "is over budget" : "is close to its limit"} —{" "}
                  {formatMoney(a.spentCents, currency)} of{" "}
                  {formatMoney(a.amountCents, currency)} (
                  {Math.round(a.percent * 100)}%).
                </span>
              </div>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <PageLoader />
      ) : !hasAny ? (
        <EmptyState
          icon="🎯"
          title="No budgets set"
          description="Set a monthly limit — overall or per category — and OdexOS will track your spending against it."
          action={
            <Button onClick={openCreate}>
              <PlusIcon /> Set your first budget
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {overall && (
            <Card>
              <div className="flex items-center gap-2 border-b border-white/10 px-4 pt-4 text-sm font-semibold text-slate-400">
                <TargetIcon size={16} /> Overall
              </div>
              <BudgetBar
                bp={overall}
                currency={currency}
                emphasise
                onEdit={() => openEdit(overall)}
                onDelete={() => {
                  if (confirm("Delete the overall budget?")) remove.mutate(overall.id);
                }}
              />
            </Card>
          )}

          {categories.length > 0 && (
            <Card className="divide-y divide-white/10">
              {categories.map((bp) => (
                <BudgetBar
                  key={bp.id}
                  bp={bp}
                  currency={currency}
                  onEdit={() => openEdit(bp)}
                  onDelete={() => {
                    if (confirm(`Delete the ${budgetLabel(bp.category)} budget?`))
                      remove.mutate(bp.id);
                  }}
                />
              ))}
            </Card>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${budgetLabel(editing.category)}` : "Set a budget"}
      >
        <form onSubmit={submit} className="space-y-4">
          {!editing && (
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {canAddOverall && <option value={OVERALL}>Overall budget</option>}
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label="Monthly limit"
            hint="Applies every month; tracked against this month's spend."
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              required
              autoFocus
            />
          </Field>

          <ErrorBanner message={error} />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {editing ? "Save changes" : "Set budget"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
