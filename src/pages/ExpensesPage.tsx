import { useMemo, useState, type FormEvent } from "react";
import {
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useMembers,
  useUpdateExpense,
} from "../lib/queries";
import {
  Avatar,
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
import { EditIcon, PlusIcon, ReceiptIcon, TrashIcon } from "../components/icons";
import { EXPENSE_COLORS } from "../lib/labels";
import { formatDate, formatMoney, todayISODate } from "../lib/format";
import { ApiError } from "../lib/api";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type Expense,
} from "@shared/types";

interface FormState {
  description: string;
  amount: string;
  category: string;
  paidBy: string;
  spentAt: string;
}

function emptyForm(): FormState {
  return {
    description: "",
    amount: "",
    category: "groceries",
    paidBy: "",
    spentAt: todayISODate(),
  };
}

function currentMonth(): string {
  return todayISODate().slice(0, 7);
}

export default function ExpensesPage() {
  const [month, setMonth] = useState(currentMonth());
  const [category, setCategory] = useState("");
  const { data: expenses, isLoading } = useExpenses({
    month,
    category: category || undefined,
  });
  const { data: members = [] } = useMembers();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const create = useCreateExpense();
  const update = useUpdateExpense();
  const remove = useDeleteExpense();
  const error =
    (create.error as ApiError | null)?.message ??
    (update.error as ApiError | null)?.message;

  const total = useMemo(
    () => (expenses ?? []).reduce((sum, e) => sum + e.amountCents, 0),
    [expenses],
  );
  const currency = expenses?.[0]?.currency ?? "GBP";

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    create.reset();
    update.reset();
    setModalOpen(true);
  }
  function openEdit(e: Expense) {
    setEditing(e);
    setForm({
      description: e.description,
      amount: (e.amountCents / 100).toString(),
      category: e.category,
      paidBy: e.paidBy ?? "",
      spentAt: e.spentAt,
    });
    create.reset();
    update.reset();
    setModalOpen(true);
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const payload = {
      description: form.description,
      amount: Number(form.amount),
      category: form.category,
      paidBy: form.paidBy || null,
      spentAt: form.spentAt,
    };
    const onDone = { onSuccess: () => setModalOpen(false) };
    if (editing) update.mutate({ id: editing.id, ...payload }, onDone);
    else create.mutate(payload, onDone);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ReceiptIcon />}
        tint="#0f9d6b"
        title="Expenses"
        subtitle="Track what the family spends, month by month."
        action={
          <Button onClick={openCreate}>
            <PlusIcon /> Add expense
          </Button>
        }
      />

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="label">Month</label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-auto"
            />
          </div>
          <div>
            <label className="label">Category</label>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Total
          </div>
          <div className="font-display text-2xl font-bold text-brand-700">
            {formatMoney(total, currency)}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <PageLoader />
      ) : (expenses ?? []).length === 0 ? (
        <EmptyState
          icon="💷"
          title="No expenses this month"
          description="Log an expense to start building your spending picture."
          action={<Button onClick={openCreate}>
            <PlusIcon /> Add expense
          </Button>}
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {(expenses ?? []).map((e) => {
            const color = EXPENSE_COLORS[e.category];
            const payer = e.paidBy ? memberById.get(e.paidBy) : undefined;
            return (
              <div key={e.id} className="group flex items-center gap-3 p-4">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ backgroundColor: `${color}1a`, color }}
                >
                  {EXPENSE_CATEGORY_LABELS[e.category].slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">
                    {e.description}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span>{EXPENSE_CATEGORY_LABELS[e.category]}</span>
                    <span>·</span>
                    <span>{formatDate(e.spentAt)}</span>
                    {payer && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Avatar name={payer.name} color={payer.color} size={16} />
                          {payer.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="font-semibold text-slate-900">
                  {formatMoney(e.amountCents, e.currency)}
                </div>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(e)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Edit"
                  >
                    <EditIcon />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${e.description}"?`)) remove.mutate(e.id);
                    }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit expense" : "Add expense"}
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Weekly grocery shop"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={form.spentAt}
                onChange={(e) => setForm({ ...form, spentAt: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paid by">
              <Select
                value={form.paidBy}
                onChange={(e) => setForm({ ...form, paidBy: e.target.value })}
              >
                <option value="">Unspecified</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

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
              {editing ? "Save changes" : "Add expense"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
