import type {
  AccountRow,
  ActivityRow,
  ExpenseRow,
  UserRow,
} from "../db/schema";
import type { Account, Activity, Expense, Member } from "@shared/types";

export function toMember(row: UserRow): Member {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    email: row.email,
    role: row.role,
    color: row.color,
    createdAt: row.createdAt,
  };
}

export function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    category: row.category,
    location: row.location,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    allDay: row.allDay,
    memberId: row.memberId,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    familyId: row.familyId,
    description: row.description,
    amountCents: row.amountCents,
    currency: row.currency,
    category: row.category,
    paidBy: row.paidBy,
    spentAt: row.spentAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    institution: row.institution,
    type: row.type,
    balanceCents: row.balanceCents,
    currency: row.currency,
    provider: row.provider,
    ownerMemberId: row.ownerMemberId,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
  };
}
