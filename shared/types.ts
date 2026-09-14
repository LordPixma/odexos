// Shared domain types + constants used by both the Cloudflare Worker (API)
// and the React frontend. Keep this file free of any runtime dependencies so
// it can be imported from either side.

export type Role = "owner" | "parent" | "child" | "member";

/**
 * Parents run the house: they issue merits, set allowances and see everyone's
 * money. The owner is a parent too — they created the family — which is why
 * the cap of two counts them.
 */
export const MAX_PARENTS = 2;

export function isParent(role: Role): boolean {
  return role === "owner" || role === "parent";
}

export type MemberStatus = "active" | "invited";

/**
 * Avatar colours. New members are given the first one nobody in the family is
 * using yet, so a household reads as distinct faces without anyone picking.
 */
export const MEMBER_COLORS: readonly string[] = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

export interface Member {
  id: string;
  familyId: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  status: MemberStatus; // "invited" until an emailed invite is accepted
  invitedAt: string | null;
  createdAt: string;
  // --- personalisation ---
  nickname: string | null;
  pronouns: string | null;
  birthday: string | null; // YYYY-MM-DD
  avatarVersion: number; // 0 = no photo uploaded
  notifyBudgetAlerts: boolean;
  notifyWeeklyDigest: boolean;
}

/** Photo URL for a member, or undefined when they haven't uploaded one. */
export function memberAvatarUrl(
  member: Pick<Member, "id" | "avatarVersion">,
): string | undefined {
  return member.avatarVersion > 0
    ? `/api/members/${member.id}/avatar?v=${member.avatarVersion}`
    : undefined;
}

/** Public details shown on the accept-invite page (no session required). */
export interface InvitePreview {
  name: string;
  email: string;
  familyName: string;
  role: Role;
}

/** Public details shown on the password-reset page (no session required). */
export interface ResetPreview {
  email: string;
}

export interface AuthState {
  member: Member;
  family: { id: string; name: string };
}

export const ACTIVITY_CATEGORIES = [
  "school",
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
  school: "School",
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
  "fortnightly",
  "monthly",
] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Every week",
  fortnightly: "Every two weeks",
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

/** What everyone's dashboard has, whatever their role. */
export interface BaseDashboardData {
  family: { id: string; name: string };
  members: Member[];
  todayActivities: Activity[];
  upcomingActivities: Activity[];
  currency: string;
  upcomingBirthdays: UpcomingBirthday[]; // next 90 days, soonest first
  choresOpen: number; // chores overdue or due today
}

/**
 * A child's dashboard. The family's money is absent rather than zeroed, so
 * there is nothing to read even with the network tab open.
 */
export interface ChildDashboardData extends BaseDashboardData {
  kind: "child";
}

export interface AdultDashboardData extends BaseDashboardData {
  kind: "adult";
  monthSpendCents: number; // combined: manual expenses + synced bank debits
  monthIncomeCents: number; // synced bank credits this month
  expenseByCategory: { category: ExpenseCategory; amountCents: number }[];
  finance: FinanceSummary;
  budgetAlerts: BudgetProgress[]; // budgets at warning/over this month
  budgets: BudgetProgress[]; // all category budgets with progress this month
  recentTransactions: Transaction[]; // latest synced bank activity
  recentExpenses: Expense[]; // latest manually-logged expenses (family feed)
  spendTrend: DailySpend[]; // last 14 days, combined spend + income per day
}

/** The discriminant is what stops a child's view reading fields it never got. */
export type AnyDashboardData = ChildDashboardData | AdultDashboardData;

/** Kept as the adult shape: most of the app's dashboard code assumes money. */
export type DashboardData = AdultDashboardData;

export interface DailySpend {
  date: string; // YYYY-MM-DD
  spendCents: number;
  incomeCents: number;
}

/** A member's next birthday, for the dashboard countdown. */
export interface UpcomingBirthday {
  memberId: string;
  name: string;
  nickname: string | null;
  color: string;
  avatarVersion: number;
  date: string; // YYYY-MM-DD of the next occurrence
  daysUntil: number; // 0 = today
  turning: number | null; // age they turn, when the birth year is known
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

// ---- Chores ----

export const CHORE_CADENCES = ["once", "daily", "weekly", "monthly"] as const;
export type ChoreCadence = (typeof CHORE_CADENCES)[number];

export const CHORE_CADENCE_LABELS: Record<ChoreCadence, string> = {
  once: "One-off",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

/** Where the current occurrence sits relative to today. */
export type ChoreStatus = "overdue" | "today" | "upcoming";

export interface Chore {
  id: string;
  familyId: string;
  title: string;
  notes: string | null;
  assignedTo: string | null; // member id; null = anyone
  cadence: ChoreCadence;
  dueDate: string; // YYYY-MM-DD of the open occurrence
  points: number;
  rotate: boolean;
  streak: number;
  archived: boolean;
  createdAt: string;
  // --- computed ---
  status: ChoreStatus;
  doneToday: boolean; // completed at some point today
  lastCompletedAt: string | null;
}

/** Per-member tally for the current week. */
export interface ChoreScore {
  memberId: string;
  done: number;
  points: number;
}

export interface ChoresOverview {
  chores: Chore[];
  doneThisWeek: number;
  openToday: number;
  scores: ChoreScore[];
}


// ---- Merits, allowance and savings ----

export interface Merit {
  id: string;
  childId: string;
  value: 1 | -1;
  note: string;
  weekStart: string; // YYYY-MM-DD, Monday
  issuedBy: string | null;
  createdAt: string;
}

/** Per-child tally for one week. Visible to the whole family. */
export interface MeritTally {
  childId: string;
  merits: number;
  demerits: number;
  net: number;
}

/** One past week, for the history view. */
export interface MeritWeek {
  weekStart: string;
  merits: number;
  demerits: number;
  net: number;
  /** The ledger line that settled it, once the week has closed. */
  settledCents: number | null;
  inspection: { rating: number; note: string | null } | null;
}

export interface MeritHistory {
  childId: string;
  currency: string;
  meritValueCents: number;
  weeks: MeritWeek[]; // newest first
  entries: Merit[]; // every merit in the window, newest first
}

export interface MeritBoard {
  weekStart: string;
  meritValueCents: number;
  currency: string;
  tallies: MeritTally[];
  recent: Merit[]; // latest entries across the family, newest first
}

export type LedgerKind = "weekly" | "payout" | "adjustment";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  amountCents: number; // signed
  weekStart: string | null;
  baseCents: number | null;
  meritCount: number | null;
  demeritCount: number | null;
  note: string | null;
  createdAt: string;
}

export interface SavingsPot {
  id: string;
  childId: string;
  name: string;
  balanceCents: number;
  targetCents: number | null;
  color: string;
  updatedAt: string;
}

/** Hard cap per child, so the page stays a list and not a filing cabinet. */
export const MAX_SAVINGS_POTS = 10;

export interface BalanceCheck {
  id: string;
  weekStart: string;
  balanceCents: number;
  note: string | null;
  createdAt: string;
}

/** Everything one child's allowance page needs. Private to them and parents. */
export interface AllowanceOverview {
  child: { id: string; name: string; nickname: string | null; color: string; avatarVersion: number };
  currency: string;
  allowanceCents: number; // the weekly rate
  meritValueCents: number;
  balanceCents: number; // running total; negative = owed back
  thisWeek: {
    weekStart: string;
    merits: number;
    demerits: number;
    meritCents: number;
    projectedCents: number; // what this week will settle at
  };
  ledger: LedgerEntry[];
  pots: SavingsPot[];
  potsTotalCents: number;
  bankBalanceCents: number | null;
  bankUpdatedAt: string | null;
  /** True when this week's balance hasn't been reported yet. */
  needsBalanceUpdate: boolean;
}

export interface RoomInspection {
  id: string;
  childId: string;
  weekStart: string;
  rating: number; // 1-5
  note: string | null;
  createdAt: string;
}

/** The Parent Centre's at-a-glance view of one child. */
export interface ChildSummary {
  id: string;
  name: string;
  nickname: string | null;
  color: string;
  avatarVersion: number;
  allowanceCents: number;
  balanceCents: number;
  thisWeek: { merits: number; demerits: number; net: number };
  inspection: RoomInspection | null;
  choresOpen: number;
  potsTotalCents: number;
  bankBalanceCents: number | null;
  needsBalanceUpdate: boolean;
}

export interface ParentCentre {
  weekStart: string;
  currency: string;
  meritValueCents: number;
  children: ChildSummary[];
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

/** The family's ICS subscribe URL (the token in it is the credential). */
export interface CalendarSubscription {
  url: string;
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
