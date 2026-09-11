import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useAccounts,
  useApplyCategoryRules,
  useCategoryRules,
  useCreateCategoryRule,
  useDeleteCategoryRule,
  useInsights,
  useTransactions,
  useUpdateTransactionCategory,
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
import { ClipboardIcon, TrashIcon } from "../components/icons";
import { EXPENSE_COLORS } from "../lib/labels";
import { formatDate, formatMoney } from "../lib/format";
import { todayISODate } from "../lib/format";
import { ApiError } from "../lib/api";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@shared/types";

function currentMonth(): string {
  return todayISODate().slice(0, 7);
}

function Stat({
  label,
  value,
  accent = "#0f172a",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-bold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState("");

  const { data: transactions, isLoading } = useTransactions({
    month,
    category: category || undefined,
    accountId: accountId || undefined,
    direction: direction || undefined,
  });
  const { data: insights } = useInsights(month);
  const { data: accounts = [] } = useAccounts();
  const recategorise = useUpdateTransactionCategory();

  const { data: rules = [] } = useCategoryRules();
  const createRule = useCreateCategoryRule();
  const deleteRule = useDeleteCategoryRule();
  const applyRules = useApplyCategoryRules();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    pattern: "",
    category: EXPENSE_CATEGORIES[0] as string,
  });

  function addRule(e: FormEvent) {
    e.preventDefault();
    if (!ruleForm.pattern.trim()) return;
    createRule.mutate(
      { pattern: ruleForm.pattern.trim(), category: ruleForm.category },
      {
        onSuccess: () =>
          setRuleForm({ pattern: "", category: EXPENSE_CATEGORIES[0] }),
      },
    );
  }

  const accountById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const syncedAccounts = accounts.filter((a) => a.connectionId);
  const currency = insights?.currency ?? "GBP";
  const topCategory = insights?.byCategory[0]?.amountCents ?? 0;
  const hasAnyTransactions =
    (transactions && transactions.length > 0) ||
    (insights?.transactionCount ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ClipboardIcon />}
        tint="#7c5cf5"
        title="Transactions"
        subtitle="Everything flowing through your linked bank accounts, auto-categorised."
        action={
          <Button variant="secondary" onClick={() => setRulesOpen(true)}>
            Category rules{rules.length > 0 ? ` (${rules.length})` : ""}
          </Button>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : syncedAccounts.length === 0 && !hasAnyTransactions ? (
        <EmptyState
          icon="🔗"
          title="No linked accounts yet"
          description="Connect a bank on the Finance page to see transactions here."
          action={
            <Link to="/finance" className="btn-primary">
              Go to Finance
            </Link>
          }
        />
      ) : (
        <>
          {/* Insights */}
          <Card className="p-5">
            <div className="grid gap-6 lg:grid-cols-[auto,1fr]">
              <div className="grid grid-cols-3 gap-6 lg:flex lg:flex-col lg:gap-4 lg:pr-6 lg:border-r lg:border-slate-100">
                <Stat
                  label="Spent"
                  value={formatMoney(insights?.totalSpentCents ?? 0, currency)}
                  accent="#d9841a"
                />
                <Stat
                  label="Income"
                  value={formatMoney(insights?.totalIncomeCents ?? 0, currency)}
                  accent="#0f9d6b"
                />
                <Stat
                  label="Transactions"
                  value={`${insights?.transactionCount ?? 0}`}
                />
              </div>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    By category
                  </div>
                  {(insights?.byCategory ?? []).length === 0 ? (
                    <p className="text-sm text-slate-400">No spending this month.</p>
                  ) : (
                    <div className="space-y-2">
                      {insights?.byCategory.map(({ category: cat, amountCents }) => (
                        <div key={cat}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="text-slate-600">
                              {EXPENSE_CATEGORY_LABELS[cat]}
                            </span>
                            <span className="font-medium text-slate-800">
                              {formatMoney(amountCents, currency)}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${topCategory ? (amountCents / topCategory) * 100 : 0}%`,
                                backgroundColor: EXPENSE_COLORS[cat],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    Top merchants
                  </div>
                  {(insights?.topMerchants ?? []).length === 0 ? (
                    <p className="text-sm text-slate-400">Nothing yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {insights?.topMerchants.map((m) => (
                        <div
                          key={m.merchant}
                          className="flex items-center justify-between py-1.5 text-sm"
                        >
                          <span className="truncate text-slate-600">
                            {m.merchant}
                            <span className="ml-1 text-xs text-slate-400">
                              ×{m.count}
                            </span>
                          </span>
                          <span className="font-medium text-slate-800">
                            {formatMoney(m.amountCents, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Filters */}
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <label className="text-sm">
              <span className="label">Month</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="input w-auto"
              />
            </label>
            <label className="text-sm">
              <span className="label">Account</span>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">All accounts</option>
                {syncedAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="label">Category</span>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              <span className="label">Type</span>
              <Select value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="">In &amp; out</option>
                <option value="debit">Money out</option>
                <option value="credit">Money in</option>
              </Select>
            </label>
          </Card>

          {/* Transaction list */}
          {(transactions ?? []).length === 0 ? (
            <EmptyState icon="🧾" title="No transactions match these filters" />
          ) : (
            <Card className="divide-y divide-slate-100">
              {(transactions ?? []).map((t) => {
                const account = accountById.get(t.accountId);
                const isCredit = t.direction === "credit";
                const color = EXPENSE_COLORS[t.category];
                return (
                  <div key={t.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">
                        {t.merchant || t.description}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span>{formatDate(t.date)}</span>
                        {account && (
                          <>
                            <span>·</span>
                            <span>{account.name}</span>
                          </>
                        )}
                        {t.categoryLocked && (
                          <>
                            <span>·</span>
                            <span className="text-slate-400">edited</span>
                          </>
                        )}
                      </div>
                    </div>
                    <select
                      value={t.category}
                      onChange={(e) =>
                        recategorise.mutate({ id: t.id, category: e.target.value })
                      }
                      disabled={isCredit}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 focus:border-brand-500 focus:outline-none disabled:opacity-50"
                      style={{ color: isCredit ? undefined : color }}
                      aria-label="Category"
                    >
                      {isCredit ? (
                        <option value={t.category}>Income</option>
                      ) : (
                        EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {EXPENSE_CATEGORY_LABELS[c]}
                          </option>
                        ))
                      )}
                    </select>
                    <div
                      className="w-24 text-right font-semibold tabular-nums"
                      style={{ color: isCredit ? "#0f766e" : "#0f172a" }}
                    >
                      {isCredit ? "+" : "−"}
                      {formatMoney(Math.abs(t.amountCents), t.currency)}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      <Modal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title="Category rules"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Teach the auto-categoriser: when a transaction's merchant or
            description contains a phrase, always file it under a category. Your
            rules beat the built-in ones and apply to existing transactions too
            (manual overrides are kept).
          </p>

          <form onSubmit={addRule} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[9rem] flex-1">
              <Field label="When it contains">
                <Input
                  value={ruleForm.pattern}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, pattern: e.target.value })
                  }
                  placeholder="e.g. Amazon"
                />
              </Field>
            </div>
            <div className="min-w-[8rem]">
              <Field label="File as">
                <Select
                  value={ruleForm.category}
                  onChange={(e) =>
                    setRuleForm({ ...ruleForm, category: e.target.value })
                  }
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={createRule.isPending}>
              Add
            </Button>
          </form>

          <ErrorBanner message={(createRule.error as ApiError | null)?.message} />

          {rules.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
              No custom rules yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-600">
                    Contains{" "}
                    <span className="font-medium text-slate-900">"{r.pattern}"</span>{" "}
                    →{" "}
                    <span
                      className="font-medium"
                      style={{ color: EXPENSE_COLORS[r.category] }}
                    >
                      {EXPENSE_CATEGORY_LABELS[r.category]}
                    </span>
                  </span>
                  <button
                    onClick={() => deleteRule.mutate(r.id)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete rule"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => applyRules.mutate()}
              disabled={applyRules.isPending}
              className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-50"
            >
              Re-apply to existing transactions
            </button>
            <Button variant="secondary" onClick={() => setRulesOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
