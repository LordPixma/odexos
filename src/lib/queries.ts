import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import type {
  Account,
  Activity,
  ApplyRulesResult,
  BankConnection,
  Budget,
  BudgetsOverview,
  CategoryRule,
  DashboardData,
  Expense,
  FinanceSummary,
  LinkStartResponse,
  List,
  ListItem,
  ListWithItems,
  Meal,
  Member,
  SpendingInsights,
  SyncResult,
  Transaction,
} from "@shared/types";

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v);
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

/** Invalidate everything that a data change might affect. */
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["finance-summary"] });
    qc.invalidateQueries({ queryKey: ["members"] });
    qc.invalidateQueries({ queryKey: ["connections"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["insights"] });
    qc.invalidateQueries({ queryKey: ["budgets"] });
  };
}

// ---- Dashboard ----
export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/dashboard"),
  });
}

// ---- Members ----
export function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: async () => (await api.get<{ members: Member[] }>("/members")).members,
  });
}

export function useCreateMember() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ member: Member }>("/members", body),
    onSuccess: invalidate,
  });
}

export function useUpdateMember() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<{ member: Member }>(`/members/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteMember() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/members/${id}`),
    onSuccess: invalidate,
  });
}

// ---- Activities ----
export function useActivities(params: {
  from?: string;
  to?: string;
  category?: string;
  memberId?: string;
} = {}) {
  return useQuery({
    queryKey: ["activities", params],
    queryFn: async () =>
      (await api.get<{ activities: Activity[] }>(`/activities${qs(params)}`))
        .activities,
  });
}

export function useCreateActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ activity: Activity }>("/activities", body),
    onSuccess: invalidate,
  });
}

export function useUpdateActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<{ activity: Activity }>(`/activities/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/activities/${id}`),
    onSuccess: invalidate,
  });
}

// ---- Expenses ----
export function useExpenses(params: {
  month?: string;
  category?: string;
  paidBy?: string;
} = {}) {
  return useQuery({
    queryKey: ["expenses", params],
    queryFn: async () =>
      (await api.get<{ expenses: Expense[] }>(`/expenses${qs(params)}`)).expenses,
  });
}

export function useCreateExpense() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ expense: Expense }>("/expenses", body),
    onSuccess: invalidate,
  });
}

export function useUpdateExpense() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<{ expense: Expense }>(`/expenses/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: invalidate,
  });
}

// ---- Finance ----
export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () =>
      (await api.get<{ accounts: Account[] }>("/finance/accounts")).accounts,
  });
}

export function useFinanceSummary() {
  return useQuery({
    queryKey: ["finance-summary"],
    queryFn: () => api.get<FinanceSummary>("/finance/summary"),
  });
}

export function useCreateAccount() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ account: Account }>("/finance/accounts", body),
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<{ account: Account }>(`/finance/accounts/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/finance/accounts/${id}`),
    onSuccess: invalidate,
  });
}

// ---- Bank connections ----
interface ConnectionsResponse {
  connections: BankConnection[];
  provider: string;
  liveProvider: boolean;
}

export function useConnections() {
  return useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<ConnectionsResponse>("/finance/connections"),
  });
}

/** Starts a link and navigates the browser to the provider consent screen. */
export function useLinkBank() {
  return useMutation({
    mutationFn: async () => {
      const { authUrl } = await api.post<LinkStartResponse>(
        "/finance/connections/link",
      );
      window.location.href = authUrl;
      return authUrl;
    },
  });
}

export function useSyncConnection() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<SyncResult>(`/finance/connections/${id}/sync`),
    onSuccess: invalidate,
  });
}

export function useSyncAll() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: () => api.post<SyncResult>("/finance/sync"),
    onSuccess: invalidate,
  });
}

export function useDisconnectBank() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/finance/connections/${id}`),
    onSuccess: invalidate,
  });
}

// ---- Transactions ----
export function useTransactions(params: {
  month?: string;
  category?: string;
  accountId?: string;
  direction?: string;
} = {}) {
  return useQuery({
    queryKey: ["transactions", params],
    queryFn: async () =>
      (await api.get<{ transactions: Transaction[] }>(`/finance/transactions${qs(params)}`))
        .transactions,
  });
}

export function useUpdateTransactionCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: string }) =>
      api.patch<{ transaction: Transaction }>(`/finance/transactions/${id}`, {
        category,
      }),
    onSuccess: invalidate,
  });
}

export function useInsights(month?: string) {
  return useQuery({
    queryKey: ["insights", month ?? "current"],
    queryFn: () => api.get<SpendingInsights>(`/finance/insights${qs({ month })}`),
  });
}

// ---- Budgets ----
export function useBudgets(month?: string) {
  return useQuery({
    queryKey: ["budgets", month ?? "current"],
    queryFn: () => api.get<BudgetsOverview>(`/finance/budgets${qs({ month })}`),
  });
}

export function useCreateBudget() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { category: string | null; amount: number }) =>
      api.post<{ budget: Budget }>("/finance/budgets", body),
    onSuccess: invalidate,
  });
}

export function useUpdateBudget() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.patch<{ budget: Budget }>(`/finance/budgets/${id}`, { amount }),
    onSuccess: invalidate,
  });
}

export function useDeleteBudget() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/finance/budgets/${id}`),
    onSuccess: invalidate,
  });
}

// ---- Category rules ----
export function useCategoryRules() {
  return useQuery({
    queryKey: ["category-rules"],
    queryFn: async () =>
      (await api.get<{ rules: CategoryRule[] }>("/finance/category-rules")).rules,
  });
}

export function useCreateCategoryRule() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (body: { pattern: string; category: string }) =>
      api.post<{ rule: CategoryRule; updated: number }>(
        "/finance/category-rules",
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category-rules"] });
      invalidate();
    },
  });
}

export function useDeleteCategoryRule() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/finance/category-rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["category-rules"] });
      invalidate();
    },
  });
}

export function useApplyCategoryRules() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: () =>
      api.post<ApplyRulesResult>("/finance/category-rules/apply"),
    onSuccess: invalidate,
  });
}

// ---- Household: lists ----
function useInvalidateLists() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["lists"] });
}

export function useLists() {
  return useQuery({
    queryKey: ["lists"],
    queryFn: async () =>
      (await api.get<{ lists: ListWithItems[] }>("/household/lists")).lists,
  });
}

export function useCreateList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (body: { name: string; type: string }) =>
      api.post<{ list: List }>("/household/lists", body),
    onSuccess: invalidate,
  });
}

export function useRenameList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/household/lists/${id}`, { name }),
    onSuccess: invalidate,
  });
}

export function useDeleteList() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/household/lists/${id}`),
    onSuccess: invalidate,
  });
}

export function useAddListItem() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({ listId, ...body }: { listId: string; text: string; assignedTo?: string | null }) =>
      api.post<{ item: ListItem }>(`/household/lists/${listId}/items`, body),
    onSuccess: invalidate,
  });
}

export function useUpdateListItem() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<{ item: ListItem }>(`/household/items/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteListItem() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/household/items/${id}`),
    onSuccess: invalidate,
  });
}

export function useClearDone() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (listId: string) =>
      api.post(`/household/lists/${listId}/clear-done`),
    onSuccess: invalidate,
  });
}

// ---- Household: meals ----
export function useMeals(weekStart?: string) {
  return useQuery({
    queryKey: ["meals", weekStart ?? "current"],
    queryFn: () =>
      api.get<{ meals: Meal[]; weekStart: string }>(
        `/household/meals${qs({ from: weekStart })}`,
      ),
  });
}

function useInvalidateMeals() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["meals"] });
}

export function useCreateMeal() {
  const invalidate = useInvalidateMeals();
  return useMutation({
    mutationFn: (body: {
      date: string;
      slot: string;
      title: string;
      notes?: string | null;
    }) => api.post<{ meal: Meal }>("/household/meals", body),
    onSuccess: invalidate,
  });
}

export function useUpdateMeal() {
  const invalidate = useInvalidateMeals();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch<{ meal: Meal }>(`/household/meals/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteMeal() {
  const invalidate = useInvalidateMeals();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/household/meals/${id}`),
    onSuccess: invalidate,
  });
}
