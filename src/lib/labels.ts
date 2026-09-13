import type {
  AccountType,
  ActivityCategory,
  ExpenseCategory,
  Role,
} from "@shared/types";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  parent: "Parent",
  child: "Child",
  member: "Member",
};

// A cohesive, slightly-muted categorical palette that sits well with the
// jade/honey brand.
export const ACTIVITY_COLORS: Record<ActivityCategory, string> = {
  school_run: "#2f74e0",
  club: "#7c5cf5",
  meeting: "#e0930f",
  weekend: "#0891b2",
  appointment: "#e5484d",
  chore: "#7c8695",
  other: "#0f8a5f",
};

export const EXPENSE_COLORS: Record<ExpenseCategory, string> = {
  groceries: "#0f9d6b",
  transport: "#2f74e0",
  utilities: "#e0930f",
  school: "#7c5cf5",
  leisure: "#e93d82",
  health: "#e5484d",
  housing: "#0891b2",
  other: "#7c8695",
};

export const ACCOUNT_COLORS: Record<AccountType, string> = {
  current: "#0f8a5f",
  savings: "#0f9d6b",
  credit: "#e5484d",
  investment: "#7c5cf5",
  pension: "#2f74e0",
  cash: "#e0930f",
};
