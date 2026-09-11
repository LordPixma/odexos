import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import type { Db } from "../../db/client";
import { accounts, bankConnections, transactions } from "../../db/schema";
import type { BankConnectionRow } from "../../db/schema";
import { decryptSecret, encryptSecret, generateId } from "../crypto";
import type { AppEnv, Bindings } from "../types";
import { categorize, type CustomRule } from "./categorize";
import { loadFamilyRules } from "../category-rules";
import { MockProvider } from "./mock";
import { TrueLayerProvider } from "./truelayer";
import type { BankProvider, ProviderAccount } from "./types";

// How far back to pull transactions on each sync (provider dedupe handles overlap).
const TRANSACTION_LOOKBACK_DAYS = 90;

const DEV_ENCRYPTION_KEY = "odexos-dev-encryption-key-change-in-production";

export function encryptionKey(env: Bindings): string {
  return env.ENCRYPTION_KEY || DEV_ENCRYPTION_KEY;
}

export function hasTrueLayerCredentials(env: Bindings): boolean {
  return Boolean(env.TRUELAYER_CLIENT_ID && env.TRUELAYER_CLIENT_SECRET);
}

/** Selects the active provider from configuration. */
export function getProvider(env: Bindings): BankProvider {
  const explicit = env.BANK_PROVIDER?.toLowerCase();
  const wantsMock = explicit === "mock";
  const wantsTrueLayer = explicit === "truelayer";

  if (!wantsMock && (wantsTrueLayer || hasTrueLayerCredentials(env))) {
    if (!hasTrueLayerCredentials(env)) {
      throw new Error(
        "TrueLayer is selected but TRUELAYER_CLIENT_ID / TRUELAYER_CLIENT_SECRET are not configured",
      );
    }
    return new TrueLayerProvider({
      clientId: env.TRUELAYER_CLIENT_ID!,
      clientSecret: env.TRUELAYER_CLIENT_SECRET!,
      env: env.TRUELAYER_ENV === "live" ? "live" : "sandbox",
    });
  }
  return new MockProvider();
}

/** The app's public origin, used to build absolute redirect URLs. */
export function appOrigin(env: Bindings, c: Context<AppEnv>): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  return new URL(c.req.url).origin;
}

/** The OAuth redirect URI (must match the provider console for TrueLayer). */
export function redirectUri(env: Bindings, c: Context<AppEnv>): string {
  return (
    env.TRUELAYER_REDIRECT_URI ||
    `${appOrigin(env, c)}/api/finance/connections/callback`
  );
}

/** Returns a valid access token for a connection, refreshing if expired. */
async function ensureAccessToken(
  db: Db,
  env: Bindings,
  provider: BankProvider,
  connection: BankConnectionRow,
): Promise<string> {
  const key = encryptionKey(env);
  const notExpired =
    connection.expiresAt &&
    new Date(connection.expiresAt).getTime() > Date.now() + 60_000;

  if (connection.accessTokenEnc && notExpired) {
    return decryptSecret(connection.accessTokenEnc, key);
  }

  if (!connection.refreshTokenEnc) {
    if (connection.accessTokenEnc) {
      return decryptSecret(connection.accessTokenEnc, key);
    }
    throw new Error("Connection has no usable tokens; please reconnect");
  }

  const refreshToken = await decryptSecret(connection.refreshTokenEnc, key);
  const tokens = await provider.refreshTokens(refreshToken);
  await db
    .update(bankConnections)
    .set({
      accessTokenEnc: await encryptSecret(tokens.accessToken, key),
      refreshTokenEnc: tokens.refreshToken
        ? await encryptSecret(tokens.refreshToken, key)
        : connection.refreshTokenEnc,
      expiresAt: tokens.expiresAt,
    })
    .where(eq(bankConnections.id, connection.id));
  return tokens.accessToken;
}

export interface ConnectionSyncResult {
  created: number;
  updated: number;
  transactionsAdded: number;
}

function lookbackDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Pulls new transactions for one account and inserts them (dedup by ref). */
async function syncTransactions(
  db: Db,
  connection: BankConnectionRow,
  provider: BankProvider,
  accessToken: string,
  pa: ProviderAccount,
  accountId: string,
  rules: CustomRule[],
): Promise<number> {
  const providerTxns = await provider.fetchTransactions(
    accessToken,
    { externalId: pa.externalId, kind: pa.kind },
    lookbackDate(TRANSACTION_LOOKBACK_DAYS),
  );
  if (providerTxns.length === 0) return 0;

  const existing = await db.query.transactions.findMany({
    where: eq(transactions.accountId, accountId),
    columns: { externalRef: true },
  });
  const seen = new Set(existing.map((t) => t.externalRef));

  const rows = providerTxns
    .filter((t) => !seen.has(t.externalId))
    .map((t) => ({
      id: generateId(),
      familyId: connection.familyId,
      accountId,
      connectionId: connection.id,
      externalRef: t.externalId,
      description: t.description,
      merchant: t.merchant,
      amountCents: t.amountCents,
      currency: t.currency,
      direction: t.direction,
      category: categorize(t, rules),
      rawCategory: t.rawCategory,
      date: t.date,
      bookedAt: t.bookedAt,
    }));

  if (rows.length === 0) return 0;
  // Insert one row at a time: Drizzle's multi-row insert into D1 misbinds
  // parameters in a way that trips foreign-key checks, so we avoid it here.
  for (const row of rows) {
    await db.insert(transactions).values(row);
  }
  return rows.length;
}

/** Syncs balances AND transactions for a connection. */
export async function syncConnection(
  db: Db,
  env: Bindings,
  connection: BankConnectionRow,
): Promise<ConnectionSyncResult> {
  const provider = getProvider(env);
  let created = 0;
  let updated = 0;
  let transactionsAdded = 0;

  try {
    const accessToken = await ensureAccessToken(db, env, provider, connection);
    const providerAccounts = await provider.fetchAccounts(accessToken);

    const existing = await db.query.accounts.findMany({
      where: eq(accounts.connectionId, connection.id),
    });
    const byRef = new Map(existing.map((a) => [a.externalRef, a]));
    const now = new Date().toISOString();

    // Map each provider account to its OdexOS account id as we upsert balances.
    const linked: { pa: ProviderAccount; accountId: string }[] = [];

    for (const pa of providerAccounts) {
      const match = byRef.get(pa.externalId);
      if (match) {
        await db
          .update(accounts)
          .set({
            balanceCents: pa.balanceCents,
            currency: pa.currency,
            institution: pa.institution,
            type: pa.type,
            lastSyncedAt: now,
          })
          .where(eq(accounts.id, match.id));
        updated++;
        linked.push({ pa, accountId: match.id });
      } else {
        const id = generateId();
        await db.insert(accounts).values({
          id,
          familyId: connection.familyId,
          name: pa.name,
          institution: pa.institution,
          type: pa.type,
          balanceCents: pa.balanceCents,
          currency: pa.currency,
          provider: connection.provider,
          externalRef: pa.externalId,
          connectionId: connection.id,
          lastSyncedAt: now,
        });
        created++;
        linked.push({ pa, accountId: id });
      }
    }

    const rules = await loadFamilyRules(db, connection.familyId);
    for (const { pa, accountId } of linked) {
      transactionsAdded += await syncTransactions(
        db,
        connection,
        provider,
        accessToken,
        pa,
        accountId,
        rules,
      );
    }

    await db
      .update(bankConnections)
      .set({ lastSyncedAt: now, status: "active", lastError: null })
      .where(eq(bankConnections.id, connection.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await db
      .update(bankConnections)
      .set({ status: "error", lastError: message })
      .where(eq(bankConnections.id, connection.id));
    throw err;
  }

  return { created, updated, transactionsAdded };
}

/**
 * Completes a consent by exchanging the code, storing encrypted tokens and
 * doing an initial sync. Returns the created connection id.
 */
export async function completeConnection(
  db: Db,
  env: Bindings,
  params: {
    familyId: string;
    userId: string;
    code: string;
    redirectUri: string;
  },
): Promise<string> {
  const provider = getProvider(env);
  const key = encryptionKey(env);
  const tokens = await provider.exchangeCode(params.code, params.redirectUri);

  const id = generateId();
  await db.insert(bankConnections).values({
    id,
    familyId: params.familyId,
    provider: provider.id,
    displayName: provider.displayName,
    status: "active",
    accessTokenEnc: await encryptSecret(tokens.accessToken, key),
    refreshTokenEnc: tokens.refreshToken
      ? await encryptSecret(tokens.refreshToken, key)
      : null,
    expiresAt: tokens.expiresAt,
    createdBy: params.userId,
  });

  const connection = await db.query.bankConnections.findFirst({
    where: and(
      eq(bankConnections.id, id),
      eq(bankConnections.familyId, params.familyId),
    ),
  });
  if (connection) {
    await syncConnection(db, env, connection);
  }
  return id;
}
