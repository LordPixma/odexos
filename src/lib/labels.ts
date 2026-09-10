import type { AccountType, ActivityCategory, ExpenseCategory } from "@shared/types";

export const ACTIVITY_COLORS: Record<ActivityCategory, string> = {
  school_run: "#0ea5e9",
  club: "#8b5cf6",
  meeting: "#f59e0b",
  weekend: "#10b981",
  appointment: "#ef4444",
  chore: "#64748b",
  other: "#6366f1",
};

export const EXPENSE_COLORS: Record<ExpenseCategory, string> = {
  groceries: "#10b981",
  transport: "#0ea5e9",
  utilities: "#f59e0b",
  school: "#8b5cf6",
  leisure: "#ec4899",
  health: "#ef4444",
  housing: "#14b8a6",
  other: "#64748b",
};

export const ACCOUNT_COLORS: Record<AccountType, string> = {
  current: "#4f46e5",
  savings: "#10b981",
  credit: "#ef4444",
  investment: "#8b5cf6",
  pension: "#0ea5e9",
  cash: "#f59e0b",
};
