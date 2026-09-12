import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useAccounts,
  useConnections,
  useCreateAccount,
  useDeleteAccount,
  useDisconnectBank,
  useFinanceSummary,
  useLinkBank,
  useMembers,
  useSyncAll,
  useSyncConnection,
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
  PageHeader,
  PageLoader,
  SectionHead,
  Select,
  Spinner,
  StatTile,
} from "../components/ui";
import {
  BankIcon,
  EditIcon,
  LinkIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  WalletIcon,
} from "../components/icons";
import { ACCOUNT_COLORS } from "../lib/labels";
import { formatDateTime, formatMoney } from "../lib/format";
import { ApiError } from "../lib/api";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  type Account,
  type BankConnection,
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

function ConnectionRow({ connection }: { connection: BankConnection }) {
  const sync = useSyncConnection();
  const disconnect = useDisconnectBank();
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
        <BankIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-white">
            {connection.displayName}
          </span>
          {connection.status === "error" ? (
            <span className="chip bg-red-500/15 text-red-300">Needs attention</span>
          ) : (
            <span className="chip bg-emerald-500/15 text-emerald-300">Connected</span>
          )}
          <span className="chip bg-white/[0.06] text-slate-400">
            {connection.accountCount} account
            {connection.accountCount === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-slate-400">
          {connection.status === "error" && connection.lastError
            ? connection.lastError
            : connection.lastSyncedAt
              ? `Last synced ${formatDateTime(connection.lastSyncedAt)}`
              : "Not yet synced"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => sync.mutate(connection.id)}
          disabled={sync.isPending}
        >
          {sync.isPending ? <Spinner className="h-4 w-4" /> : <RefreshIcon />}
          Sync
        </Button>
        <button
          onClick={() => {
            if (
              confirm(
                `Disconnect ${connection.displayName}? Synced accounts stay as manual entries.`,
              )
            )
              disconnect.mutate(connection.id);
          }}
          className="rounded-md p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
          aria-label="Disconnect"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

export default function FinancePage() {
  const { data: accounts, isLoading } = useAccounts();
  const { data: summary } = useFinanceSummary();
  const { data: connectionsData } = useConnections();
  const { data: members = [] } = useMembers();
  const memberById = new Map(members.map((m) => [m.id, m]));

  const link = useLinkBank();
  const syncAll = useSyncAll();
  const [searchParams, setSearchParams] = useSearchParams();

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
  const connections = connectionsData?.connections ?? [];
  const isMock = connectionsData?.provider === "mock";

  // Surface the result of the OAuth callback redirect.
  const [banner, setBanner] = useState<
    { kind: "ok" | "error"; text: string } | null
  >(null);
  useEffect(() => {
    if (searchParams.get("bank_connected")) {
      setBanner({ kind: "ok", text: "Bank connected — accounts are syncing." });
      searchParams.delete("bank_connected");
      setSearchParams(searchParams, { replace: true });
    } else if (searchParams.get("bank_error")) {
      setBanner({ kind: "error", text: searchParams.get("bank_error")! });
      searchParams.delete("bank_error");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editingSynced = editing != null && editing.provider !== "manual";

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
    const base = {
      name: form.name,
      institution: form.institution || null,
      type: form.type,
      ownerMemberId: form.ownerMemberId || null,
    };
    const onDone = { onSuccess: () => setModalOpen(false) };
    if (editing) {
      // Don't overwrite a bank-synced balance from the form.
      const payload = editingSynced
        ? base
        : { ...base, balance: Number(form.balance || 0) };
      update.mutate({ id: editing.id, ...payload }, onDone);
    } else {
      create.mutate({ ...base, balance: Number(form.balance || 0) }, onDone);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<WalletIcon />}
        tint="#0f8a5f"
        title="Finance"
        subtitle="Your family's financial posture across every account."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => link.mutate()}
              disabled={link.isPending}
            >
              {link.isPending ? <Spinner className="h-4 w-4" /> : <LinkIcon />}
              Connect a bank
            </Button>
            <Button onClick={openCreate}>
              <PlusIcon /> Add account
            </Button>
          </div>
        }
      />

      {banner && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === "ok"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/25 bg-red-500/10 text-red-300"
          }`}
        >
          <span>{banner.text}</span>
          <button
            onClick={() => setBanner(null)}
            className="text-current opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Total assets"
          value={formatMoney(summary?.totalAssetsCents ?? 0, currency)}
          tint="#0f9d6b"
        />
        <StatTile
          label="Liabilities"
          value={formatMoney(summary?.totalLiabilitiesCents ?? 0, currency)}
          tint="#e5484d"
        />
        <StatTile
          label="Net worth"
          value={formatMoney(summary?.netWorthCents ?? 0, currency)}
          tint={(summary?.netWorthCents ?? 0) >= 0 ? "#0f8a5f" : "#e5484d"}
        />
      </div>

      {/* Connected banks */}
      <Card className="p-5">
        <SectionHead
          icon={<BankIcon size={18} />}
          tint="#2f74e0"
          title="Connected banks"
          subtitle={
            isMock
              ? "Demo mode — a built-in mock bank. Add TrueLayer credentials to link real accounts."
              : "Balances sync automatically via TrueLayer Open Banking."
          }
          action={
            connections.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => syncAll.mutate()}
                disabled={syncAll.isPending}
              >
                {syncAll.isPending ? <Spinner className="h-4 w-4" /> : <RefreshIcon />}
                Sync all
              </Button>
            )
          }
        />
        {connections.length === 0 ? (
          <EmptyState
            icon="🏦"
            title="No banks connected"
            description={
              isMock
                ? "Connect the demo bank to see accounts and balances sync automatically."
                : "Securely connect your bank to sync balances automatically."
            }
            action={
              <Button onClick={() => link.mutate()} disabled={link.isPending}>
                <LinkIcon /> Connect a bank
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-white/10">
            {connections.map((conn) => (
              <ConnectionRow key={conn.id} connection={conn} />
            ))}
          </div>
        )}
        {(link.error as ApiError | null)?.message && (
          <div className="mt-3">
            <ErrorBanner message={(link.error as ApiError).message} />
          </div>
        )}
      </Card>

      {/* Accounts */}
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-white">
          All accounts
        </h2>
        {isLoading ? (
          <PageLoader />
        ) : (accounts ?? []).length === 0 ? (
          <EmptyState
            icon="💼"
            title="No accounts yet"
            description="Connect a bank, or add accounts manually to see your net worth."
            action={
              <Button onClick={openCreate}>
                <PlusIcon /> Add account
              </Button>
            }
          />
        ) : (
          <Card className="divide-y divide-white/10">
            {(accounts ?? []).map((a) => {
              const color = ACCOUNT_COLORS[a.type];
              const owner = a.ownerMemberId
                ? memberById.get(a.ownerMemberId)
                : undefined;
              const isLiability = LIABILITY_ACCOUNT_TYPES.includes(a.type);
              const synced = a.connectionId != null;
              return (
                <div key={a.id} className="group flex items-center gap-3 p-4">
                  <span
                    className="h-10 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{a.name}</span>
                      <span
                        className="chip"
                        style={{ backgroundColor: `${color}1a`, color }}
                      >
                        {ACCOUNT_TYPE_LABELS[a.type]}
                      </span>
                      {synced && (
                        <span className="chip bg-brand-500/15 text-brand-300">
                          <RefreshIcon size={12} /> Synced
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
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
                    className="font-semibold tabular-nums"
                    style={{ color: isLiability ? "#f87171" : "#f1f5f9" }}
                  >
                    {isLiability ? "−" : ""}
                    {formatMoney(a.balanceCents, a.currency)}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => openEdit(a)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-200"
                      aria-label="Edit"
                    >
                      <EditIcon />
                    </button>
                    {!synced && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${a.name}"?`)) remove.mutate(a.id);
                        }}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
                        aria-label="Delete"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

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
                editingSynced
                  ? "Synced from your bank"
                  : LIABILITY_ACCOUNT_TYPES.includes(form.type as Account["type"])
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
                disabled={editingSynced}
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
