import { apiFetch, buildQuery } from "./client";
import type {
  ForecastBalancesResponse,
  ListsResponse,
  LoginResponse,
  MergeResponse,
  RegisterDirection,
  RegisterEntry,
  RegisterResponse,
  SessionUser,
  TransferApplyResponse,
  TransferCreateResponse,
} from "./types";

// --- auth ---

export function login(
  email: string,
  password: string,
  tokenChallenge?: string,
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/login", {
    method: "POST",
    body: {
      email,
      password,
      // Inline TOTP/backup-code challenge — the cookie-based pending-MFA
      // endpoints are not usable from a native client.
      ...(tokenChallenge ? { tokenChallenge } : {}),
    },
  });
}

export function logout(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/logout", { method: "POST" });
}

export function validateToken(): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/validate-token");
}

export function fetchUser(): Promise<SessionUser> {
  return apiFetch<SessionUser>("/api/user");
}

// --- accounts & forecast ---

export function getLists(): Promise<ListsResponse> {
  return apiFetch<ListsResponse>("/api/lists");
}

export function getForecastBalances(params: {
  accountId: string;
  budgetId: number;
  monthsAhead: number;
}): Promise<ForecastBalancesResponse> {
  return apiFetch<ForecastBalancesResponse>(
    `/api/account-registers/forecast-balances${buildQuery({
      accountId: params.accountId,
      budgetId: params.budgetId,
      monthsAhead: params.monthsAhead,
    })}`,
  );
}

// --- register entries ---

export function getRegisterEntries(params: {
  accountRegisterId: number;
  direction: RegisterDirection;
  skip?: number;
  take?: number;
  focusedAt?: string;
}): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>(
    `/api/register${buildQuery({
      accountRegisterId: params.accountRegisterId,
      direction: params.direction,
      skip: params.skip,
      take: params.take,
      focusedAt: params.focusedAt,
    })}`,
  );
}

export function clearEntry(params: {
  registerEntryId: string;
  accountRegisterId: number;
  isCleared: boolean;
}): Promise<RegisterEntry> {
  return apiFetch<RegisterEntry>("/api/register-entry", {
    method: "PATCH",
    body: params,
  });
}

export function applyEntryAsTransfer(params: {
  registerEntryId: string;
  accountRegisterId: number;
  targetAccountRegisterId: number;
}): Promise<TransferApplyResponse> {
  return apiFetch<TransferApplyResponse>("/api/register-entry-transfer", {
    method: "POST",
    body: params,
  });
}

export function createTransfer(params: {
  sourceAccountRegisterId: number;
  targetAccountRegisterId: number;
  amount: number;
  description: string;
  targetDescription?: string;
  createdAt: string;
}): Promise<TransferCreateResponse> {
  return apiFetch<TransferCreateResponse>(
    "/api/register-entry-transfer-create",
    { method: "POST", body: params },
  );
}

export function mergeEntries(params: {
  accountRegisterId: number;
  keepRegisterEntryId: string;
  duplicateRegisterEntryId: string;
}): Promise<MergeResponse> {
  return apiFetch<MergeResponse>("/api/register-entry-merge", {
    method: "POST",
    body: params,
  });
}
