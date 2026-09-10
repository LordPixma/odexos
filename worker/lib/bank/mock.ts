import type { BankProvider, ProviderAccount, ProviderTokens } from "./types";

function hourFromNow(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

// Small random drift (±£20) so re-syncing visibly updates balances in a demo.
function jitter(): number {
  return Math.round((Math.random() - 0.5) * 4000);
}

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
        name: "Everyday Current",
        type: "current",
        institution: "Mock Bank",
        balanceCents: 342117 + jitter(),
        currency: "GBP",
      },
      {
        externalId: "mock-savings",
        name: "Family Savings",
        type: "savings",
        institution: "Mock Bank",
        balanceCents: 1875000 + jitter(),
        currency: "GBP",
      },
      {
        externalId: "mock-credit",
        name: "Rewards Credit Card",
        type: "credit",
        institution: "Mock Bank",
        balanceCents: 65432 + Math.abs(jitter()),
        currency: "GBP",
      },
    ];
  }
}
