import type { AccountType, BankProviderId } from "@shared/types";

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO 8601
}

export interface ProviderAccount {
  externalId: string;
  name: string;
  type: AccountType;
  institution: string;
  balanceCents: number;
  currency: string;
}

/**
 * A pluggable Open Banking provider. TrueLayer is the real implementation;
 * MockProvider is a fully-working stand-in used when no credentials are set,
 * so the connect → sync → disconnect flow works end-to-end in development.
 */
export interface BankProvider {
  id: BankProviderId;
  /** Label used for connections created via this provider. */
  displayName: string;
  /** Where the browser is sent to grant consent. */
  buildAuthUrl(state: string, redirectUri: string): string;
  /** Exchange the returned auth code for tokens. */
  exchangeCode(code: string, redirectUri: string): Promise<ProviderTokens>;
  /** Use a refresh token to obtain a fresh access token. */
  refreshTokens(refreshToken: string): Promise<ProviderTokens>;
  /** Fetch the accounts + balances the consent grants access to. */
  fetchAccounts(accessToken: string): Promise<ProviderAccount[]>;
}
