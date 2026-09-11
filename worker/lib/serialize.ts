import type {
  AccountRow,
  ActivityRow,
  BankConnectionRow,
  BudgetRow,
  CategoryRuleRow,
  ExpenseRow,
  TransactionRow,
  UserRow,
} from "../db/schema";
import type {
  Account,
  Activity,
  BankConnection,
  Budget,
  CategoryRule,
  Expense,
  Member,
  Transaction,
} from "@shared/types";

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
    recurrence: row.recurrence,
    recurrenceUntil: row.recurrenceUntil,
    seriesId: null,
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
    connectionId: row.connectionId,
    ownerMemberId: row.ownerMemberId,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
  };
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    familyId: row.familyId,
    accountId: row.accountId,
    connectionId: row.connectionId,
    description: row.description,
    merchant: row.merchant,
    amountCents: row.amountCents,
    currency: row.currency,
    direction: row.direction,
    category: row.category,
    categoryLocked: row.categoryLocked,
    rawCategory: row.rawCategory,
    date: row.date,
    bookedAt: row.bookedAt,
    createdAt: row.createdAt,
  };
}

export function toCategoryRule(row: CategoryRuleRow): CategoryRule {
  return {
    id: row.id,
    pattern: row.pattern,
    category: row.category,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    category: row.category,
    amountCents: row.amountCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toBankConnection(
  row: BankConnectionRow,
  accountCount: number,
): BankConnection {
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.displayName,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    accountCount,
    createdAt: row.createdAt,
  };
}
