// Shared domain types + constants used by both the Cloudflare Worker (API)
// and the React frontend. Keep this file free of any runtime dependencies so
// it can be imported from either side.

export type Role = "owner" | "adult" | "child" | "member";

export interface Member {
  id: string;
  familyId: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  createdAt: string;
}

export interface AuthState {
  member: Member;
  family: { id: string; name: string };
}

export const ACTIVITY_CATEGORIES = [
  "school_run",
  "club",
  "meeting",
  "weekend",
  "appointment",
  "chore",
  "other",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  school_run: "School run",
  club: "Club",
  meeting: "Meeting",
  weekend: "Weekend plan",
  appointment: "Appointment",
  chore: "Chore",
  other: "Other",
};

export const RECURRENCE_RULES = [
  "none",
  "daily",
  "weekdays",
  "weekly",
  "monthly",
] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Every week",
  monthly: "Every month",
};

export interface Activity {
  id: string;
  familyId: string;
  title: string;
  category: ActivityCategory;
  location: string | null;
  startsAt: string; // ISO 8601
  endsAt: string | null; // ISO 8601
  allDay: boolean;
  memberId: string | null; // assigned member, null = whole family
  notes: string | null;
  recurrence: RecurrenceRule;
  recurrenceUntil: string | null; // YYYY-MM-DD
  seriesId: string | null; // set on generated occurrences → the base activity id
  createdBy: string;
  createdAt: string;
}

export const EXPENSE_CATEGORIES = [
  "groceries",
  "transport",
  "utilities",
  "school",
  "leisure",
  "health",
  "housing",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  groceries: "Groceries",
  transport: "Transport",
  utilities: "Utilities",
  school: "School",
  leisure: "Leisure",
  health: "Health",
  housing: "Housing",
  other: "Other",
};

export interface Expense {
  id: string;
  familyId: string;
  description: string;
  amountCents: number;
  currency: string;
  category: ExpenseCategory;
  paidBy: string | null; // member id
  spentAt: string; // ISO date (YYYY-MM-DD)
  createdBy: string;
  createdAt: string;
}

export const ACCOUNT_TYPES = [
  "current",
  "savings",
  "credit",
  "investment",
  "pension",
  "cash",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  current: "Current account",
  savings: "Savings",
  credit: "Credit card",
  investment: "Investment",
  pension: "Pension",
  cash: "Cash",
};

// Liabilities count against net worth.
export const LIABILITY_ACCOUNT_TYPES: AccountType[] = ["credit"];

// Providers that can be connected for automatic syncing.
export type BankProviderId = "truelayer" | "plaid" | "mock";
export type AccountProvider = "manual" | BankProviderId;

export interface Account {
  id: string;
  familyId: string;
  name: string;
  institution: string | null;
  type: AccountType;
  balanceCents: number;
  currency: string;
  provider: AccountProvider;
  connectionId: string | null; // set when the account is bank-synced
  ownerMemberId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export type BankConnectionStatus = "active" | "error" | "revoked";

export interface BankConnection {
  id: string;
  provider: BankProviderId;
  displayName: string;
  status: BankConnectionStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
  accountCount: number;
  createdAt: string;
}

/** Returned by the "start link" endpoint — the browser navigates here. */
export interface LinkStartResponse {
  authUrl: string;
}

/** Result of a sync operation. */
export interface SyncResult {
  connections: number;
  accountsUpdated: number;
  accountsCreated: number;
  transactionsAdded: number;
}

export type TransactionDirection = "debit" | "credit";

export interface Transaction {
  id: string;
  familyId: string;
  accountId: string;
  connectionId: string | null;
  description: string;
  merchant: string | null;
  amountCents: number; // signed: negative = money out, positive = money in
  currency: string;
  direction: TransactionDirection;
  category: ExpenseCategory;
  categoryLocked: boolean;
  rawCategory: string | null;
  date: string; // YYYY-MM-DD
  bookedAt: string | null;
  createdAt: string;
}

export interface SpendingInsights {
  month: string; // YYYY-MM
  currency: string;
  totalSpentCents: number; // sum of debits (money out)
  totalIncomeCents: number; // sum of credits (money in)
  transactionCount: number;
  byCategory: { category: ExpenseCategory; amountCents: number }[];
  topMerchants: { merchant: string; amountCents: number; count: number }[];
}

// Family-defined auto-categorisation rule.
export interface CategoryRule {
  id: string;
  pattern: string;
  category: ExpenseCategory;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyRulesResult {
  updated: number;
}

// A budget's category is null for the overall/total monthly limit.
export type BudgetCategory = ExpenseCategory | null;
export type BudgetStatus = "ok" | "warning" | "over";

/** Spend crosses into "warning" at this fraction of the limit. */
export const BUDGET_WARNING_THRESHOLD = 0.8;

export interface Budget {
  id: string;
  category: BudgetCategory;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
}

/** A budget plus its computed spend for a given month. */
export interface BudgetProgress {
  id: string;
  category: BudgetCategory;
  amountCents: number;
  spentCents: number;
  remainingCents: number; // may be negative when over budget
  percent: number; // 0..∞ (spent / amount)
  status: BudgetStatus;
}

export interface BudgetsOverview {
  month: string; // YYYY-MM
  currency: string;
  overall: BudgetProgress | null;
  categories: BudgetProgress[];
  alerts: BudgetProgress[]; // categories/overall at warning or over
}

export interface FinanceSummary {
  currency: string;
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  accountCount: number;
  byType: { type: AccountType; balanceCents: number }[];
}

export interface DashboardData {
  family: { id: string; name: string };
  members: Member[];
  todayActivities: Activity[];
  upcomingActivities: Activity[];
  monthSpendCents: number; // combined: manual expenses + synced bank debits
  monthIncomeCents: number; // synced bank credits this month
  currency: string;
  expenseByCategory: { category: ExpenseCategory; amountCents: number }[];
  finance: FinanceSummary;
  budgetAlerts: BudgetProgress[]; // budgets at warning/over this month
  recentTransactions: Transaction[]; // latest synced bank activity
}

// ---- Shared lists & meal planning ----

export const LIST_TYPES = ["shopping", "todo", "chores", "custom"] as const;
export type ListType = (typeof LIST_TYPES)[number];

export const LIST_TYPE_LABELS: Record<ListType, string> = {
  shopping: "Shopping",
  todo: "To-do",
  chores: "Chores",
  custom: "List",
};

export interface ListItem {
  id: string;
  listId: string;
  text: string;
  done: boolean;
  assignedTo: string | null;
  position: number;
  createdAt: string;
}

export interface List {
  id: string;
  familyId: string;
  name: string;
  type: ListType;
  createdAt: string;
}

export interface ListWithItems extends List {
  items: ListItem[];
}

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export interface Meal {
  id: string;
  familyId: string;
  date: string; // YYYY-MM-DD
  slot: MealSlot;
  title: string;
  notes: string | null;
  createdAt: string;
}

// ---- Notifications & family settings ----

export type NotificationType = "budget_warning" | "budget_over";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  category: string | null;
  month: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unread: number;
}

export interface FamilySettings {
  id: string;
  name: string;
  currency: string;
  alertEmails: boolean;
  weeklyDigest: boolean;
}

export interface DigestPreview {
  subject: string;
  text: string;
  html: string;
}

export interface DigestSendResult {
  sent: number; // number of recipients emailed
}

export interface ApiError {
  error: string;
}
