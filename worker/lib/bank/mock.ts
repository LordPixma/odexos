import type { TransactionDirection } from "@shared/types";
import type {
  BankProvider,
  ProviderAccount,
  ProviderAccountKind,
  ProviderTokens,
  ProviderTransaction,
} from "./types";

function hourFromNow(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

// Small random drift (±£20) so re-syncing visibly updates balances in a demo.
function jitter(): number {
  return Math.round((Math.random() - 0.5) * 4000);
}

function dateDaysAgo(n: number): { date: string; bookedAt: string } {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return { date: d.toISOString().slice(0, 10), bookedAt: d.toISOString() };
}

interface CatalogEntry {
  desc: string;
  merchant: string;
  amountCents: number; // signed
  direction: TransactionDirection;
  rawCategory: string;
  daysAgo: number;
}

// A stable catalog keyed by account — stable ids mean re-syncs dedupe cleanly.
const CATALOG: Record<string, CatalogEntry[]> = {
  "mock-current": [
    { desc: "TESCO STORES 2891", merchant: "Tesco", amountCents: -4285, direction: "debit", rawCategory: "Groceries", daysAgo: 1 },
    { desc: "TFL TRAVEL CHARGE", merchant: "TfL", amountCents: -1540, direction: "debit", rawCategory: "Transport", daysAgo: 2 },
    { desc: "COSTA COFFEE 118", merchant: "Costa", amountCents: -395, direction: "debit", rawCategory: "Eating out", daysAgo: 3 },
    { desc: "AMAZON.CO.UK*A12BC", merchant: "Amazon", amountCents: -2399, direction: "debit", rawCategory: "Shopping", daysAgo: 5 },
    { desc: "SHELL BROMLEY", merchant: "Shell", amountCents: -6210, direction: "debit", rawCategory: "Transport", daysAgo: 6 },
    { desc: "THAMES WATER DD", merchant: "Thames Water", amountCents: -4500, direction: "debit", rawCategory: "Utilities", daysAgo: 8 },
    { desc: "NETFLIX.COM", merchant: "Netflix", amountCents: -1099, direction: "debit", rawCategory: "Entertainment", daysAgo: 10 },
    { desc: "SALARY - ACME LTD", merchant: "Acme Ltd", amountCents: 285000, direction: "credit", rawCategory: "Salary", daysAgo: 12 },
    { desc: "ST MARY'S SCHOOL", merchant: "St Mary's School", amountCents: -3500, direction: "debit", rawCategory: "Education", daysAgo: 14 },
    { desc: "SAINSBURYS S/MKT", merchant: "Sainsbury's", amountCents: -5170, direction: "debit", rawCategory: "Groceries", daysAgo: 18 },
  ],
  "mock-credit": [
    { desc: "NANDO'S BROMLEY", merchant: "Nando's", amountCents: -3820, direction: "debit", rawCategory: "Eating out", daysAgo: 2 },
    { desc: "BOOTS 6721", merchant: "Boots", amountCents: -1245, direction: "debit", rawCategory: "Health", daysAgo: 4 },
    { desc: "UBER *TRIP", merchant: "Uber", amountCents: -1830, direction: "debit", rawCategory: "Transport", daysAgo: 7 },
    { desc: "ODEON CINEMAS", merchant: "Odeon", amountCents: -2600, direction: "debit", rawCategory: "Entertainment", daysAgo: 9 },
    { desc: "AMAZON PRIME*MEMB", merchant: "Amazon Prime", amountCents: -899, direction: "debit", rawCategory: "Entertainment", daysAgo: 15 },
  ],
  "mock-savings": [
    { desc: "STANDING ORDER SAVINGS", merchant: "Transfer", amountCents: 20000, direction: "credit", rawCategory: "Transfer", daysAgo: 3 },
  ],
};

/**
 * A self-contained fake Open Banking provider. Its "auth URL" points straight
 * back at our own callback with a canned code, simulating instant consent — so
 * the whole flow is exercisable without any external service.
 */
export class MockProvider implements BankProvider {
  id = "mock" as const;
  displayName = "Mock Bank (demo)";

  buildAuthUrl(state: string, redirectUri: string): string {
    // redirectUri may be relative (dev) or absolute (prod) — append params
    // manually so this works either way.
    const sep = redirectUri.includes("?") ? "&" : "?";
    return `${redirectUri}${sep}code=mock-authorization-code&state=${encodeURIComponent(
      state,
    )}`;
  }

  async exchangeCode(): Promise<ProviderTokens> {
    return {
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      expiresAt: hourFromNow(),
    };
  }

  async refreshTokens(): Promise<ProviderTokens> {
    return {
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      expiresAt: hourFromNow(),
    };
  }

  async fetchAccounts(): Promise<ProviderAccount[]> {
    return [
      {
        externalId: "mock-current",
        kind: "account",
        name: "Everyday Current",
        type: "current",
        institution: "Mock Bank",
        balanceCents: 342117 + jitter(),
        currency: "GBP",
      },
      {
        externalId: "mock-savings",
        kind: "account",
        name: "Family Savings",
        type: "savings",
        institution: "Mock Bank",
        balanceCents: 1875000 + jitter(),
        currency: "GBP",
      },
      {
        externalId: "mock-credit",
        kind: "card",
        name: "Rewards Credit Card",
        type: "credit",
        institution: "Mock Bank",
        balanceCents: 65432 + Math.abs(jitter()),
        currency: "GBP",
      },
    ];
  }

  async fetchTransactions(
    _accessToken: string,
    account: { externalId: string; kind: ProviderAccountKind },
  ): Promise<ProviderTransaction[]> {
    const entries = CATALOG[account.externalId] ?? [];
    return entries.map((e, i) => {
      const { date, bookedAt } = dateDaysAgo(e.daysAgo);
      return {
        externalId: `${account.externalId}-tx-${i}`,
        description: e.desc,
        merchant: e.merchant,
        amountCents: e.amountCents,
        direction: e.direction,
        currency: "GBP",
        date,
        bookedAt,
        rawCategory: e.rawCategory,
      };
    });
  }
}
