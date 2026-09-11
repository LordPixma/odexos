import type {
  AccountType,
  BankProviderId,
  TransactionDirection,
} from "@shared/types";

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO 8601
}

/** Which Data API endpoint family an account belongs to. */
export type ProviderAccountKind = "account" | "card";

export interface ProviderAccount {
  externalId: string;
  kind: ProviderAccountKind;
  name: string;
  type: AccountType;
  institution: string;
  balanceCents: number;
  currency: string;
}

export interface ProviderTransaction {
  externalId: string;
  description: string;
  merchant: string | null;
  amountCents: number; // signed: negative = money out, positive = money in
  direction: TransactionDirection;
  currency: string;
  date: string; // YYYY-MM-DD
  bookedAt: string | null; // ISO 8601
  rawCategory: string | null;
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
  /** Fetch transactions for one account since `from` (YYYY-MM-DD, inclusive). */
  fetchTransactions(
    accessToken: string,
    account: { externalId: string; kind: ProviderAccountKind },
    from: string,
  ): Promise<ProviderTransaction[]>;
}
