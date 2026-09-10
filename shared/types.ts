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

export type AccountProvider = "manual" | "truelayer" | "plaid";

export interface Account {
  id: string;
  familyId: string;
  name: string;
  institution: string | null;
  type: AccountType;
  balanceCents: number;
  currency: string;
  provider: AccountProvider;
  ownerMemberId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
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
  monthSpendCents: number;
  currency: string;
  expenseByCategory: { category: ExpenseCategory; amountCents: number }[];
  finance: FinanceSummary;
}

export interface ApiError {
  error: string;
}
