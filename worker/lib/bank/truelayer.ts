import type { AccountType, TransactionDirection } from "@shared/types";
import type {
  BankProvider,
  ProviderAccount,
  ProviderAccountKind,
  ProviderTokens,
  ProviderTransaction,
} from "./types";

interface TrueLayerConfig {
  clientId: string;
  clientSecret: string;
  env: "sandbox" | "live";
}

function mapAccountType(t?: string): AccountType {
  switch ((t ?? "").toUpperCase()) {
    case "SAVINGS":
      return "savings";
    case "TRANSACTION":
    case "BUSINESS_TRANSACTION":
    default:
      return "current";
  }
}

function toCents(amount: unknown): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * TrueLayer Data API (Open Banking) provider.
 * Docs: https://docs.truelayer.com/docs/data-api-basics
 */
export class TrueLayerProvider implements BankProvider {
  id = "truelayer" as const;
  displayName = "TrueLayer";

  constructor(private cfg: TrueLayerConfig) {}

  private get authBase(): string {
    return this.cfg.env === "live"
      ? "https://auth.truelayer.com"
      : "https://auth.truelayer-sandbox.com";
  }
  private get apiBase(): string {
    return this.cfg.env === "live"
      ? "https://api.truelayer.com"
      : "https://api.truelayer-sandbox.com";
  }

  buildAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.cfg.clientId,
      scope: "info accounts balance cards transactions offline_access",
      redirect_uri: redirectUri,
      state,
      providers:
        this.cfg.env === "live"
          ? "uk-ob-all uk-oauth-all"
          : "uk-cs-mock uk-ob-all uk-oauth-all",
    });
    return `${this.authBase}/?${params.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens> {
    return this.token({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  }

  async refreshTokens(refreshToken: string): Promise<ProviderTokens> {
    return this.token({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  private async token(
    extra: Record<string, string>,
  ): Promise<ProviderTokens> {
    const res = await fetch(`${this.authBase}/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        ...extra,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `TrueLayer token request failed (${res.status}): ${await res.text()}`,
      );
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const expiresIn = Number(data.expires_in ?? 3600);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  private async get<T>(accessToken: string, path: string): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`TrueLayer GET ${path} failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  async fetchAccounts(accessToken: string): Promise<ProviderAccount[]> {
    type Provider = { display_name?: string };
    type Acct = {
      account_id: string;
      display_name?: string;
      account_type?: string;
      currency?: string;
      provider?: Provider;
    };
    type Balance = { current?: number; available?: number; currency?: string };
    type Listing<T> = { results?: T[] };

    const out: ProviderAccount[] = [];

    const accounts = await this.get<Listing<Acct>>(
      accessToken,
      "/data/v1/accounts",
    );
    for (const a of accounts.results ?? []) {
      const bal = await this.get<Listing<Balance>>(
        accessToken,
        `/data/v1/accounts/${a.account_id}/balance`,
      ).catch(() => ({ results: [] }) as Listing<Balance>);
      const b = bal.results?.[0];
      out.push({
        externalId: a.account_id,
        kind: "account",
        name: a.display_name || a.account_type || "Account",
        type: mapAccountType(a.account_type),
        institution: a.provider?.display_name ?? "Bank",
        balanceCents: toCents(b?.current ?? 0),
        currency: a.currency ?? b?.currency ?? "GBP",
      });
    }

    // Credit cards are a separate endpoint.
    const cards = await this.get<Listing<Acct>>(
      accessToken,
      "/data/v1/cards",
    ).catch(() => ({ results: [] }) as Listing<Acct>);
    for (const c of cards.results ?? []) {
      const bal = await this.get<Listing<Balance>>(
        accessToken,
        `/data/v1/cards/${c.account_id}/balance`,
      ).catch(() => ({ results: [] }) as Listing<Balance>);
      const b = bal.results?.[0];
      out.push({
        externalId: c.account_id,
        kind: "card",
        name: c.display_name || "Credit card",
        type: "credit",
        institution: c.provider?.display_name ?? "Bank",
        // Card balance represents amount owed; store as a positive liability.
        balanceCents: Math.abs(toCents(b?.current ?? 0)),
        currency: c.currency ?? b?.currency ?? "GBP",
      });
    }

    return out;
  }

  async fetchTransactions(
    accessToken: string,
    account: { externalId: string; kind: ProviderAccountKind },
    from: string,
  ): Promise<ProviderTransaction[]> {
    type Txn = {
      transaction_id?: string;
      normalised_provider_transaction_id?: string;
      timestamp?: string;
      description?: string;
      amount?: number;
      currency?: string;
      transaction_type?: string; // "DEBIT" | "CREDIT"
      transaction_category?: string;
      transaction_classification?: string[];
      merchant_name?: string;
    };
    type Listing<T> = { results?: T[] };

    const base = account.kind === "card" ? "cards" : "accounts";
    // `to` must not be in the future. Asking for the end of today was a 400 on
    // every account, which is what silently emptied this feed — so use the
    // current instant, formatted the way TrueLayer documents it.
    const to = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const path = `/data/v1/${base}/${account.externalId}/transactions?from=${from}T00:00:00Z&to=${to}`;

    // Deliberately not caught here. Swallowing the failure made a broken
    // transaction feed indistinguishable from an account that simply had no
    // activity — the caller records the reason per account instead.
    const data = await this.get<Listing<Txn>>(accessToken, path);

    return (data.results ?? []).map((t) => {
      const direction: TransactionDirection =
        (t.transaction_type ?? "").toUpperCase() === "CREDIT"
          ? "credit"
          : "debit";
      const magnitude = Math.abs(toCents(t.amount ?? 0));
      const rawCategory =
        t.transaction_classification?.join(" / ") ??
        t.transaction_category ??
        null;
      const ts = t.timestamp ?? new Date().toISOString();
      return {
        externalId:
          t.transaction_id ||
          t.normalised_provider_transaction_id ||
          `${ts}-${t.amount}-${t.description ?? ""}`,
        description: t.description || t.merchant_name || "Transaction",
        merchant: t.merchant_name ?? null,
        amountCents: direction === "credit" ? magnitude : -magnitude,
        direction,
        currency: t.currency ?? "GBP",
        date: ts.slice(0, 10),
        bookedAt: ts,
        rawCategory,
      };
    });
  }
}
