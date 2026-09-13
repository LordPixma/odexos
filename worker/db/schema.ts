import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// A family is the top-level tenant. Everything else is scoped to a family.
export const families = sqliteTable("families", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("GBP"),
  alertEmails: integer("alert_emails", { mode: "boolean" })
    .notNull()
    .default(true),
  weeklyDigest: integer("weekly_digest", { mode: "boolean" })
    .notNull()
    .default(true),
  lastDigestWeek: text("last_digest_week"), // Monday (YYYY-MM-DD) of last send
  // YYYY-MM-DD we last ran birthday reminders for, so they send once a day.
  lastBirthdayDate: text("last_birthday_date"),
  // Secret that authenticates the public ICS feed. Null until someone asks for
  // the subscribe link; rotating it invalidates every existing subscription.
  calendarToken: text("calendar_token").unique(),
  // What one merit is worth, in pence. Configurable so the rate can change
  // without a deploy.
  meritValueCents: integer("merit_value_cents").notNull().default(50),
  // Monday (YYYY-MM-DD) of the last week settled into the allowance ledger,
  // so a week is never posted twice.
  lastAllowanceWeek: text("last_allowance_week"),
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
    // Empty for a member who was invited but hasn't accepted yet.
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["owner", "parent", "child", "member"] })
      .notNull()
      .default("member"),
    color: text("color").notNull().default("#6366f1"),
    // "active" once the member has a password; "invited" while an emailed
    // invite is outstanding (they can't sign in until they accept it).
    status: text("status", { enum: ["active", "invited"] })
      .notNull()
      .default("active"),
    inviteTokenHash: text("invite_token_hash"), // SHA-256 of the invite token
    inviteExpiresAt: text("invite_expires_at"), // ISO 8601
    invitedBy: text("invited_by"), // user id of the inviter (no FK: informational)
    invitedAt: text("invited_at"), // ISO 8601
    resetTokenHash: text("reset_token_hash"), // SHA-256 of the password-reset token
    resetExpiresAt: text("reset_expires_at"), // ISO 8601
    // --- personalisation ---
    nickname: text("nickname"), // what the family actually calls them
    pronouns: text("pronouns"),
    birthday: text("birthday"), // YYYY-MM-DD
    // 0 = no photo; bumped on every upload so <img> URLs cache-bust.
    avatarVersion: integer("avatar_version").notNull().default(0),
    // Base weekly allowance in pence, for children. Merits are added on top.
    allowanceCents: integer("allowance_cents").notNull().default(0),
    notifyBudgetAlerts: integer("notify_budget_alerts", { mode: "boolean" })
      .notNull()
      .default(true),
    notifyWeeklyDigest: integer("notify_weekly_digest", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("users_family_idx").on(t.familyId),
    inviteTokenIdx: index("users_invite_token_idx").on(t.inviteTokenHash),
    resetTokenIdx: index("users_reset_token_idx").on(t.resetTokenHash),
  }),
);

// Member profile photos, kept out of `users` so member lists stay light.
// Stored as base64 of a small (256px) WebP the browser crops before upload.
export const memberAvatars = sqliteTable("member_avatars", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: text("data").notNull(), // base64, no data: prefix
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

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
    recurrence: text("recurrence", {
      enum: ["none", "daily", "weekdays", "weekly", "monthly"],
    })
      .notNull()
      .default("none"),
    recurrenceUntil: text("recurrence_until"), // YYYY-MM-DD, nullable
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
    provider: text("provider", { enum: ["manual", "truelayer", "plaid", "mock"] })
      .notNull()
      .default("manual"),
    externalRef: text("external_ref"),
    connectionId: text("connection_id").references(() => bankConnections.id, {
      onDelete: "set null",
    }),
    ownerMemberId: text("owner_member_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastSyncedAt: text("last_synced_at"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("accounts_family_idx").on(t.familyId),
    connectionIdx: index("accounts_connection_idx").on(t.connectionId),
  }),
);

// A linked Open Banking connection (one consent = one connection, which may
// expose several accounts/cards). Access + refresh tokens are stored encrypted.
export const bankConnections = sqliteTable(
  "bank_connections",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["truelayer", "plaid", "mock"] })
      .notNull()
      .default("truelayer"),
    displayName: text("display_name").notNull(),
    status: text("status", { enum: ["active", "error", "revoked"] })
      .notNull()
      .default("active"),
    accessTokenEnc: text("access_token_enc"),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: text("expires_at"), // ISO 8601 — access token expiry
    lastSyncedAt: text("last_synced_at"),
    lastError: text("last_error"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("bank_connections_family_idx").on(t.familyId),
  }),
);

// Short-lived CSRF/state tokens for the OAuth connect round-trip.
export const bankOauthStates = sqliteTable("bank_oauth_states", {
  id: text("id").primaryKey(), // the opaque `state` value
  familyId: text("family_id")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["truelayer", "plaid", "mock"] }).notNull(),
  redirectUri: text("redirect_uri").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// Bank transactions pulled from linked accounts. `amount_cents` is signed:
// negative = money out (spend), positive = money in. `external_ref` is the
// provider's transaction id and is unique per account so re-syncs dedupe.
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => bankConnections.id, {
      onDelete: "set null",
    }),
    externalRef: text("external_ref").notNull(),
    description: text("description").notNull(),
    merchant: text("merchant"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("GBP"),
    direction: text("direction", { enum: ["debit", "credit"] })
      .notNull()
      .default("debit"),
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
    categoryLocked: integer("category_locked", { mode: "boolean" })
      .notNull()
      .default(false), // true once a member overrides the auto-category
    rawCategory: text("raw_category"),
    date: text("date").notNull(), // YYYY-MM-DD
    bookedAt: text("booked_at"), // ISO 8601 timestamp
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyDateIdx: index("transactions_family_date_idx").on(t.familyId, t.date),
    accountRefUnique: uniqueIndex("transactions_account_ref_unique").on(
      t.accountId,
      t.externalRef,
    ),
  }),
);

// Monthly spending budgets. One standing budget per category (applied every
// month); `category` NULL means an overall/total monthly limit.
export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
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
    }), // NULL = overall monthly budget
    amountCents: integer("amount_cents").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("budgets_family_idx").on(t.familyId),
  }),
);

// Family-defined auto-categorisation rules: when a transaction's merchant or
// description contains `pattern`, assign `category`. Checked before the
// built-in keyword rules; higher `priority` wins.
export const categoryRules = sqliteTable(
  "category_rules",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
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
    }).notNull(),
    priority: integer("priority").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("category_rules_family_idx").on(t.familyId),
  }),
);

// Shared family lists (shopping, to-do, chores).
export const lists = sqliteTable(
  "lists",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["shopping", "todo", "chores", "custom"] })
      .notNull()
      .default("custom"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("lists_family_idx").on(t.familyId),
  }),
);

export const listItems = sqliteTable(
  "list_items",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    assignedTo: text("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    listIdx: index("list_items_list_idx").on(t.listId),
  }),
);

// Weekly meal planner: one row per planned meal.
export const meals = sqliteTable(
  "meals",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    slot: text("slot", { enum: ["breakfast", "lunch", "dinner", "snack"] })
      .notNull()
      .default("dinner"),
    title: text("title").notNull(),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyDateIdx: index("meals_family_date_idx").on(t.familyId, t.date),
  }),
);

// Recurring household chores. `due_date` is the current open occurrence;
// completing a chore records it and rolls the date forward by its cadence.
export const chores = sqliteTable(
  "chores",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    assignedTo: text("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    cadence: text("cadence", { enum: ["once", "daily", "weekly", "monthly"] })
      .notNull()
      .default("weekly"),
    dueDate: text("due_date").notNull(), // YYYY-MM-DD of the open occurrence
    points: integer("points").notNull().default(0),
    // Hand the chore to the next family member each time it's completed.
    rotate: integer("rotate", { mode: "boolean" }).notNull().default(false),
    streak: integer("streak").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyDueIdx: index("chores_family_due_idx").on(t.familyId, t.dueDate),
  }),
);

// One row per completed occurrence, so streaks and "who did what" hold up.
export const choreCompletions = sqliteTable(
  "chore_completions",
  {
    id: text("id").primaryKey(),
    choreId: text("chore_id")
      .notNull()
      .references(() => chores.id, { onDelete: "cascade" }),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    memberId: text("member_id").references(() => users.id, {
      onDelete: "set null",
    }),
    forDate: text("for_date").notNull(), // the occurrence that was completed
    points: integer("points").notNull().default(0),
    completedAt: text("completed_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    choreIdx: index("chore_completions_chore_idx").on(t.choreId),
    familyIdx: index("chore_completions_family_idx").on(t.familyId, t.completedAt),
    occurrenceUnique: uniqueIndex("chore_completions_occurrence_unique").on(
      t.choreId,
      t.forDate,
    ),
  }),
);

// In-app notifications (budget alerts, …). `dedupe_key` is unique per family
// so the same alert isn't created twice.
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["budget_warning", "budget_over"] }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category"),
    month: text("month"), // YYYY-MM
    dedupeKey: text("dedupe_key").notNull(),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    familyIdx: index("notifications_family_idx").on(t.familyId),
    dedupeUnique: uniqueIndex("notifications_family_dedupe_unique").on(
      t.familyId,
      t.dedupeKey,
    ),
  }),
);

// One per browser/device a member has turned notifications on in. Keyed by the
// push service's endpoint URL, which is what identifies a subscription.
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(), // browser's ECDH public key
    auth: text("auth").notNull(), // browser's auth secret
    userAgent: text("user_agent"), // so a member can tell their devices apart
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    lastUsedAt: text("last_used_at"),
  },
  (t) => ({
    userIdx: index("push_subscriptions_user_idx").on(t.userId),
    familyIdx: index("push_subscriptions_family_idx").on(t.familyId),
  }),
);

// --- Merits, allowance and savings (the children's side of the house) ---

// A single merit (+1) or demerit (-1), always with a reason attached.
// `weekStart` is the Monday the entry counts toward, fixed at issue time so a
// late correction can't quietly move money between weeks.
export const merits = sqliteTable(
  "merits",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: integer("value").notNull(), // +1 or -1
    note: text("note").notNull(),
    weekStart: text("week_start").notNull(), // YYYY-MM-DD, Monday
    issuedBy: text("issued_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    childWeekIdx: index("merits_child_week_idx").on(t.childId, t.weekStart),
    familyIdx: index("merits_family_idx").on(t.familyId, t.createdAt),
  }),
);

/**
 * Append-only money ledger, one row per event. A child's balance is the sum of
 * its amounts, which is what makes a bad week carry forward: a negative weekly
 * line simply leaves the running total short until it's earned back.
 */
export const allowanceLedger = sqliteTable(
  "allowance_ledger",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["weekly", "payout", "adjustment"] })
      .notNull()
      .default("weekly"),
    amountCents: integer("amount_cents").notNull(), // signed
    // Set on "weekly" rows; the unique index below stops a week posting twice.
    weekStart: text("week_start"),
    baseCents: integer("base_cents"), // the allowance rate used that week
    meritCount: integer("merit_count"),
    demeritCount: integer("demerit_count"),
    note: text("note"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    childIdx: index("allowance_ledger_child_idx").on(t.childId, t.createdAt),
    weeklyUnique: uniqueIndex("allowance_ledger_weekly_unique").on(
      t.childId,
      t.kind,
      t.weekStart,
    ),
  }),
);

// A child's savings pots. Capped at 10 each, enforced in the route.
export const savingsPots = sqliteTable(
  "savings_pots",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    balanceCents: integer("balance_cents").notNull().default(0),
    targetCents: integer("target_cents"), // null = saving with no goal
    color: text("color").notNull().default("#6366f1"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    childIdx: index("savings_pots_child_idx").on(t.childId),
  }),
);

/**
 * A child's own reading of their bank balance. Their accounts can't be linked,
 * so this is self-reported weekly — history rather than a single field, so the
 * trend is visible and a correction doesn't erase what was said before.
 */
export const balanceChecks = sqliteTable(
  "balance_checks",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: text("week_start").notNull(), // YYYY-MM-DD, Monday
    balanceCents: integer("balance_cents").notNull(),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    childWeekUnique: uniqueIndex("balance_checks_child_week_unique").on(
      t.childId,
      t.weekStart,
    ),
  }),
);

// Weekly room inspection: a 1-5 rating and a note, one per child per week.
export const roomInspections = sqliteTable(
  "room_inspections",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: text("week_start").notNull(), // YYYY-MM-DD, Monday
    rating: integer("rating").notNull(), // 1-5
    note: text("note"),
    inspectedBy: text("inspected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    childWeekUnique: uniqueIndex("room_inspections_child_week_unique").on(
      t.childId,
      t.weekStart,
    ),
  }),
);

export type FamilyRow = typeof families.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type MemberAvatarRow = typeof memberAvatars.$inferSelect;
export type ActivityRow = typeof activities.$inferSelect;
export type ExpenseRow = typeof expenses.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type BankConnectionRow = typeof bankConnections.$inferSelect;
export type BankOauthStateRow = typeof bankOauthStates.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
export type CategoryRuleRow = typeof categoryRules.$inferSelect;
export type ListRow = typeof lists.$inferSelect;
export type ListItemRow = typeof listItems.$inferSelect;
export type MealRow = typeof meals.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type ChoreRow = typeof chores.$inferSelect;
export type ChoreCompletionRow = typeof choreCompletions.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type MeritRow = typeof merits.$inferSelect;
export type AllowanceLedgerRow = typeof allowanceLedger.$inferSelect;
export type SavingsPotRow = typeof savingsPots.$inferSelect;
export type BalanceCheckRow = typeof balanceChecks.$inferSelect;
export type RoomInspectionRow = typeof roomInspections.$inferSelect;
