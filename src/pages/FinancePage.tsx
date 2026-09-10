import { useState, type FormEvent } from "react";
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useFinanceSummary,
  useMembers,
  useUpdateAccount,
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
  PageLoader,
  Select,
} from "../components/ui";
import { EditIcon, PlusIcon, TrashIcon } from "../components/icons";
import { ACCOUNT_COLORS } from "../lib/labels";
import { formatMoney } from "../lib/format";
import { ApiError } from "../lib/api";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  type Account,
} from "@shared/types";

interface FormState {
  name: string;
  institution: string;
  type: string;
  balance: string;
  ownerMemberId: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    institution: "",
    type: "current",
    balance: "",
    ownerMemberId: "",
  };
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card className="p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold" style={{ color: accent }}>
        {value}
      </div>
    </Card>
  );
}

export default function FinancePage() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: summary } = useFinanceSummary();
  const { data: members = [] } = useMembers();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const create = useCreateAccount();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const error =
    (create.error as ApiError | null)?.message ??
    (update.error as ApiError | null)?.message;

  const currency = summary?.currency ?? "GBP";

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    create.reset();
    update.reset();
    setModalOpen(true);
  }
  function openEdit(a: Account) {
    setEditing(a);
    setForm({
      name: a.name,
      institution: a.institution ?? "",
      type: a.type,
      balance: (a.balanceCents / 100).toString(),
      ownerMemberId: a.ownerMemberId ?? "",
    });
    create.reset();
    update.reset();
    setModalOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      institution: form.institution || null,
      type: form.type,
      balance: Number(form.balance || 0),
      ownerMemberId: form.ownerMemberId || null,
    };
    const onDone = { onSuccess: () => setModalOpen(false) };
    if (editing) update.mutate({ id: editing.id, ...payload }, onDone);
    else create.mutate(payload, onDone);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Finance
          </h1>
          <p className="text-sm text-slate-500">
            Your family's financial posture across every account.
          </p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon /> Add account
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Total assets"
          value={formatMoney(summary?.totalAssetsCents ?? 0, currency)}
          accent="#0f766e"
        />
        <SummaryCard
          label="Liabilities"
          value={formatMoney(summary?.totalLiabilitiesCents ?? 0, currency)}
          accent="#dc2626"
        />
        <SummaryCard
          label="Net worth"
          value={formatMoney(summary?.netWorthCents ?? 0, currency)}
          accent={(summary?.netWorthCents ?? 0) >= 0 ? "#4f46e5" : "#dc2626"}
        />
      </div>

      <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        💡 Balances are entered manually for now. Automatic bank syncing (via an
        Open Banking provider such as TrueLayer or Plaid) is planned — the data
        model is already built for it.
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (accounts ?? []).length === 0 ? (
        <EmptyState
          icon="🏦"
          title="No accounts yet"
          description="Add your current accounts, savings, cards and investments to see your net worth."
          action={<Button onClick={openCreate}>
            <PlusIcon /> Add account
          </Button>}
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {(accounts ?? []).map((a) => {
            const color = ACCOUNT_COLORS[a.type];
            const owner = a.ownerMemberId ? memberById.get(a.ownerMemberId) : undefined;
            const isLiability = LIABILITY_ACCOUNT_TYPES.includes(a.type);
            return (
              <div key={a.id} className="group flex items-center gap-3 p-4">
                <span
                  className="h-10 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{a.name}</span>
                    <span
                      className="chip"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      {ACCOUNT_TYPE_LABELS[a.type]}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    {a.institution && <span>{a.institution}</span>}
                    {owner && (
                      <>
                        {a.institution && <span>·</span>}
                        <span className="inline-flex items-center gap-1">
                          <Avatar name={owner.name} color={owner.color} size={16} />
                          {owner.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div
                  className="font-semibold"
                  style={{ color: isLiability ? "#dc2626" : "#0f172a" }}
                >
                  {isLiability ? "−" : ""}
                  {formatMoney(a.balanceCents, a.currency)}
                </div>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(a)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Edit"
                  >
                    <EditIcon />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${a.name}"?`)) remove.mutate(a.id);
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
        title={editing ? "Edit account" : "Add account"}
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Account name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Everyday current account"
              required
            />
          </Field>
          <Field label="Institution (optional)">
            <Input
              value={form.institution}
              onChange={(e) => setForm({ ...form, institution: e.target.value })}
              placeholder="Monzo, Barclays, …"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Balance"
              hint={
                LIABILITY_ACCOUNT_TYPES.includes(form.type as Account["type"])
                  ? "Amount owed (counts against net worth)"
                  : undefined
              }
            >
              <Input
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                placeholder="0.00"
              />
            </Field>
          </div>
          <Field label="Owner (optional)">
            <Select
              value={form.ownerMemberId}
              onChange={(e) => setForm({ ...form, ownerMemberId: e.target.value })}
            >
              <option value="">Joint / family</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
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
              {editing ? "Save changes" : "Add account"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
