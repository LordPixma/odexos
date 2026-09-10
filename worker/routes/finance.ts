import { Hono, type Context } from "hono";
import { and, asc, eq } from "drizzle-orm";
import {
  accounts,
  bankConnections,
  bankOauthStates,
  families,
  users,
} from "../db/schema";
import { generateId, generateToken } from "../lib/crypto";
import { toAccount, toBankConnection } from "../lib/serialize";
import type { AppEnv } from "../lib/types";
import {
  badRequest,
  optionalString,
  requireAmountCents,
  requireEnum,
  requireString,
} from "../lib/validate";
import {
  completeConnection,
  getProvider,
  hasTrueLayerCredentials,
  redirectUri,
  syncConnection,
} from "../lib/bank";
import {
  ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  type AccountType,
  type FinanceSummary,
  type SyncResult,
} from "@shared/types";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

const app = new Hono<AppEnv>();

async function assertOwnerMember(
  db: AppEnv["Variables"]["db"],
  familyId: string,
  memberId: string | null,
): Promise<string | null> {
  if (!memberId) return null;
  const member = await db.query.users.findFirst({
    where: and(eq(users.id, memberId), eq(users.familyId, familyId)),
  });
  if (!member) badRequest("Account owner is not part of this family");
  return memberId;
}

app.get("/accounts", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const rows = await db.query.accounts.findMany({
    where: eq(accounts.familyId, familyId),
    orderBy: [asc(accounts.type), asc(accounts.name)],
  });
  return c.json({ accounts: rows.map(toAccount) });
});

app.post("/accounts", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const name = requireString(body.name, "Account name", { max: 120 });
  const type = requireEnum(body.type, ACCOUNT_TYPES, "Type");
  const balanceCents = requireAmountCents(body.balance ?? 0, "Balance");
  const fam = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  const currency =
    optionalString(body.currency, "Currency", { max: 3 }) ?? fam?.currency ?? "GBP";
  const ownerMemberId = await assertOwnerMember(
    db,
    user.familyId,
    optionalString(body.ownerMemberId, "Owner"),
  );

  const id = generateId();
  await db.insert(accounts).values({
    id,
    familyId: user.familyId,
    name,
    institution: optionalString(body.institution, "Institution", { max: 120 }),
    type,
    balanceCents,
    currency,
    provider: "manual",
    ownerMemberId,
    lastSyncedAt: new Date().toISOString(),
  });
  const created = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
  });
  return c.json({ account: created ? toAccount(created) : null }, 201);
});

app.patch("/accounts/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Account not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates: Partial<typeof accounts.$inferInsert> = {};
  if (body.name !== undefined)
    updates.name = requireString(body.name, "Account name", { max: 120 });
  if (body.institution !== undefined)
    updates.institution = optionalString(body.institution, "Institution", { max: 120 });
  if (body.type !== undefined)
    updates.type = requireEnum(body.type, ACCOUNT_TYPES, "Type");
  if (body.balance !== undefined) {
    updates.balanceCents = requireAmountCents(body.balance, "Balance");
    updates.lastSyncedAt = new Date().toISOString();
  }
  if (body.currency !== undefined)
    updates.currency =
      optionalString(body.currency, "Currency", { max: 3 }) ?? existing.currency;
  if (body.ownerMemberId !== undefined)
    updates.ownerMemberId = await assertOwnerMember(
      db,
      user.familyId,
      optionalString(body.ownerMemberId, "Owner"),
    );

  await db.update(accounts).set(updates).where(eq(accounts.id, id));
  const updated = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
  });
  return c.json({ account: updated ? toAccount(updated) : null });
});

app.delete("/accounts/:id", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.familyId, user.familyId)),
  });
  if (!existing) return c.json({ error: "Account not found" }, 404);
  await db.delete(accounts).where(eq(accounts.id, id));
  return c.json({ ok: true });
});

// Aggregate financial posture across all family accounts.
app.get("/summary", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const fam = await db.query.families.findFirst({
    where: eq(families.id, user.familyId),
  });
  const rows = await db.query.accounts.findMany({
    where: eq(accounts.familyId, user.familyId),
  });

  const liabilityTypes = new Set<AccountType>(LIABILITY_ACCOUNT_TYPES);
  const byTypeMap = new Map<AccountType, number>();
  let assets = 0;
  let liabilities = 0;
  for (const a of rows) {
    byTypeMap.set(a.type, (byTypeMap.get(a.type) ?? 0) + a.balanceCents);
    if (liabilityTypes.has(a.type)) liabilities += a.balanceCents;
    else assets += a.balanceCents;
  }

  const summary: FinanceSummary = {
    currency: fam?.currency ?? "GBP",
    totalAssetsCents: assets,
    totalLiabilitiesCents: liabilities,
    netWorthCents: assets - liabilities,
    accountCount: rows.length,
    byType: [...byTypeMap.entries()].map(([type, balanceCents]) => ({
      type,
      balanceCents,
    })),
  };
  return c.json(summary);
});

// ---------------------------------------------------------------------------
// Bank connections (Open Banking)
// ---------------------------------------------------------------------------

// List the family's linked bank connections + which provider is active.
app.get("/connections", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;

  const conns = await db.query.bankConnections.findMany({
    where: eq(bankConnections.familyId, familyId),
    orderBy: [asc(bankConnections.createdAt)],
  });
  const familyAccounts = await db.query.accounts.findMany({
    where: eq(accounts.familyId, familyId),
  });
  const countByConnection = new Map<string, number>();
  for (const a of familyAccounts) {
    if (a.connectionId) {
      countByConnection.set(
        a.connectionId,
        (countByConnection.get(a.connectionId) ?? 0) + 1,
      );
    }
  }

  let providerId = "mock";
  try {
    providerId = getProvider(c.env).id;
  } catch {
    /* misconfigured — reported when the user tries to link */
  }

  return c.json({
    connections: conns.map((conn) =>
      toBankConnection(conn, countByConnection.get(conn.id) ?? 0),
    ),
    provider: providerId,
    liveProvider: hasTrueLayerCredentials(c.env),
  });
});

// Start a link: create a one-time state token and return the consent URL.
app.post("/connections/link", async (c) => {
  const db = c.get("db");
  const user = c.get("user");

  let provider;
  try {
    provider = getProvider(c.env);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Provider unavailable" },
      500,
    );
  }

  const state = generateToken();
  const absoluteRedirect = redirectUri(c.env, c);
  await db.insert(bankOauthStates).values({
    id: state,
    familyId: user.familyId,
    userId: user.id,
    provider: provider.id,
    redirectUri: absoluteRedirect,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString(),
  });

  // The mock provider navigates back through our own callback; keeping it a
  // relative path means dev stays on a single origin (Vite proxy → Worker).
  const authRedirect =
    provider.id === "mock"
      ? "/api/finance/connections/callback"
      : absoluteRedirect;
  return c.json({ authUrl: provider.buildAuthUrl(state, authRedirect) });
});

// Sync one connection now.
app.post("/connections/:id/sync", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const conn = await db.query.bankConnections.findFirst({
    where: and(
      eq(bankConnections.id, c.req.param("id")),
      eq(bankConnections.familyId, familyId),
    ),
  });
  if (!conn) return c.json({ error: "Connection not found" }, 404);
  try {
    const r = await syncConnection(db, c.env, conn);
    return c.json<SyncResult>({
      connections: 1,
      accountsUpdated: r.updated,
      accountsCreated: r.created,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      502,
    );
  }
});

// Sync all of the family's connections.
app.post("/sync", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const conns = await db.query.bankConnections.findMany({
    where: eq(bankConnections.familyId, familyId),
  });
  let updated = 0;
  let created = 0;
  let ok = 0;
  for (const conn of conns) {
    try {
      const r = await syncConnection(db, c.env, conn);
      updated += r.updated;
      created += r.created;
      ok++;
    } catch {
      /* status/lastError already recorded on the connection */
    }
  }
  return c.json<SyncResult>({
    connections: ok,
    accountsUpdated: updated,
    accountsCreated: created,
  });
});

// Disconnect: detach synced accounts (they become manual, keeping balances).
app.delete("/connections/:id", async (c) => {
  const db = c.get("db");
  const familyId = c.get("user").familyId;
  const id = c.req.param("id");
  const conn = await db.query.bankConnections.findFirst({
    where: and(eq(bankConnections.id, id), eq(bankConnections.familyId, familyId)),
  });
  if (!conn) return c.json({ error: "Connection not found" }, 404);

  await db
    .update(accounts)
    .set({ connectionId: null, provider: "manual" })
    .where(eq(accounts.connectionId, id));
  await db.delete(bankConnections).where(eq(bankConnections.id, id));
  return c.json({ ok: true });
});

// Public OAuth callback (secured by the one-time `state`, not the session).
// Registered directly on the app before the auth gate — see worker/index.ts.
export const bankCallback = async (c: Context<AppEnv>) => {
  const db = c.get("db");
  const { code, state, error } = c.req.query();
  const fail = (msg: string) =>
    c.redirect(`/finance?bank_error=${encodeURIComponent(msg)}`);

  if (error) return fail(error);
  if (!code || !state) return fail("Missing authorization response");

  const stateRow = await db.query.bankOauthStates.findFirst({
    where: eq(bankOauthStates.id, state),
  });
  if (!stateRow) return fail("Invalid or expired link session");
  // State is single-use.
  await db.delete(bankOauthStates).where(eq(bankOauthStates.id, state));
  if (new Date(stateRow.expiresAt).getTime() < Date.now()) {
    return fail("Link session expired — please try again");
  }

  try {
    await completeConnection(db, c.env, {
      familyId: stateRow.familyId,
      userId: stateRow.userId,
      code,
      redirectUri: stateRow.redirectUri,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not connect bank");
  }
  return c.redirect("/finance?bank_connected=1");
};

export default app;
