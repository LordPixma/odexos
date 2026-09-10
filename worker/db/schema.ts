import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// A family is the top-level tenant. Everything else is scoped to a family.
export const families = sqliteTable("families", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("GBP"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// A member is a person in the family who can log into the portal.
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["owner", "adult", "child", "member"] })
      .notNull()
      .default("member"),
    color: text("color").notNull().default("#6366f1"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("users_family_idx").on(t.familyId),
  }),
);

// Opaque session tokens, stored server-side so we can revoke them.
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // random opaque token
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(), // ISO 8601
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

// Activities: school runs, clubs, meetings, weekend plans, appointments, etc.
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category", {
      enum: [
        "school_run",
        "club",
        "meeting",
        "weekend",
        "appointment",
        "chore",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    location: text("location"),
    startsAt: text("starts_at").notNull(), // ISO 8601
    endsAt: text("ends_at"), // ISO 8601, nullable
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
    memberId: text("member_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyStartIdx: index("activities_family_start_idx").on(
      t.familyId,
      t.startsAt,
    ),
  }),
);

// Family expenses.
export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("GBP"),
    category: text("category", {
      enum: [
        "groceries",
        "transport",
        "utilities",
        "school",
        "leisure",
        "health",
        "housing",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    paidBy: text("paid_by").references(() => users.id, { onDelete: "set null" }),
    spentAt: text("spent_at").notNull(), // YYYY-MM-DD
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyDateIdx: index("expenses_family_date_idx").on(t.familyId, t.spentAt),
  }),
);

// Financial accounts for the family's financial-posture dashboard.
// `provider` supports a future bank-aggregation integration (TrueLayer / Plaid);
// for now balances are entered/updated manually.
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    institution: text("institution"),
    type: text("type", {
      enum: ["current", "savings", "credit", "investment", "pension", "cash"],
    })
      .notNull()
      .default("current"),
    balanceCents: integer("balance_cents").notNull().default(0),
    currency: text("currency").notNull().default("GBP"),
    provider: text("provider", { enum: ["manual", "truelayer", "plaid"] })
      .notNull()
      .default("manual"),
    externalRef: text("external_ref"),
    ownerMemberId: text("owner_member_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("accounts_family_idx").on(t.familyId),
  }),
);

export type FamilyRow = typeof families.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
