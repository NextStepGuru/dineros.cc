/**
 * API response shapes, mirroring the server's zod schemas
 * (app/schema/zod.ts) and endpoint handlers. Decimal fields arrive as
 * strings over JSON — run them through num() before doing math.
 */

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  countryId?: string | null;
  timezoneOffset?: number | null;
  isDaylightSaving?: boolean | null;
  settings?: unknown;
  role: string;
  isAdmin?: boolean;
};

export type LoginResponse = {
  token?: string;
  message?: string | null;
  user?: SessionUser;
  twoFactorChallengeRequired?: boolean;
  mfaMethods?: string[];
};

export type AccountRegister = {
  id: number;
  name: string;
  accountId: string;
  budgetId: number;
  balance: number | string;
  latestBalance: number | string;
  subAccountRegisterId: number | null;
  typeId: number;
  isArchived: boolean;
  accountType?: { name?: string } | null;
  isCredit?: boolean;
};

export type SavingsGoal = {
  id: number;
  name: string;
  targetAmount: number | string;
  sourceAccountRegisterId: number | null;
  targetAccountRegisterId: number | null;
};

export type ListsResponse = {
  reoccurrences: unknown[];
  intervals: { id: number; name: string }[];
  accountTypes: unknown[];
  accountRegisters: AccountRegister[];
  budgets: { id: number; name: string }[];
  accounts: { id: string; name: string }[];
  categories: unknown[];
  savingsGoals: SavingsGoal[];
  memberships: unknown[];
};

export type ForecastBalancesResponse = {
  asOf: string;
  balances: Record<string, number>;
};

export type RegisterEntry = {
  id: string;
  accountRegisterId: number;
  sourceAccountRegisterId?: number | null;
  description: string;
  reoccurrenceId?: number | null;
  amount: number | string;
  balance: number | string;
  typeId?: number | null;
  categoryId?: string | null;
  isProjected: boolean;
  isReconciled: boolean;
  isCleared: boolean;
  isBalanceEntry: boolean;
  isPending: boolean;
  isManualEntry?: boolean;
  isMatched?: boolean;
  createdAt: string;
};

export type RegisterDirection = "future" | "past";

export type RegisterResponse = {
  entries: RegisterEntry[];
  lowest?: RegisterEntry | null;
  highest?: RegisterEntry | null;
  lowestByHorizon?: Record<string, RegisterEntry | null>;
  skip: number;
  focusedAt: string;
  take: number;
  loadMode: string;
  isPartialLoad: boolean;
  hasMore: boolean;
  totalCount: number;
};

export type TransferCreateResponse = {
  sourceEntry: RegisterEntry;
  targetEntry: RegisterEntry;
  message: string;
};

export type TransferApplyResponse = {
  originalEntry: RegisterEntry;
  transferEntry: RegisterEntry;
  message: string;
};

export type MergeResponse = {
  keptEntry: RegisterEntry;
  removedEntryId: string;
  message: string;
};
