/* eslint-disable no-unused-vars */
import type {
  PrismaClient,
  Reoccurrence,
  AccountRegister,
} from "@prisma/client";
import type { RegisterEntry } from "../../../types/types";
import type {
  CacheRegisterEntry,
  CacheAccountRegister,
  CacheReoccurrence,
} from "./ModernCacheService";

// Core Domain Types
export interface ForecastContext {
  accountId?: string;
  /** When set, only registers / entries / reoccurrences for this budget are loaded and persisted. */
  budgetId?: number;
  startDate: Date;
  endDate: Date;
  logging?: ForecastLoggingConfig;
}

export interface ForecastResult {
  registerEntries: RegisterEntry[];
  accountRegisters: AccountRegister[];
  isSuccess: boolean;
  datesProcessed?: number;
  errors?: string[];
}

// Service Interfaces
export interface IDataLoaderService {
  loadAccountData(context: ForecastContext): Promise<AccountData>;
}

export interface IAccountRegisterService {
  initTimelineAccountCaches(): void;
  /** Move statementAt forward to the first due date on/after forecast start (no interest posted). */
  alignStatementAtForForecastStart(
    startDate: any,
    accountRegisters: CacheAccountRegister[],
  ): void;
  updateBalance(accountId: number, amount: number): void;
  getAccount(accountId: number): CacheAccountRegister | null;
  processInterestCharges(
    accounts: CacheAccountRegister[],
    forecastDate?: any
  ): Promise<void>;
  updateStatementDates(
    accounts: CacheAccountRegister[],
    forecastDate?: any
  ): Promise<void>;
  getPendingStatementAtUpdates(): { id: number; statementAt: Date }[];
  clearPendingStatementAtUpdates(): void;
}

export interface IReoccurrenceService {
  initReoccurrenceSchedule(startDate: Date, endDate: Date): void;
  processReoccurrences(
    reoccurrences: Reoccurrence[],
    endDate: Date
  ): Promise<void>;
  calculateNextOccurrence(reoccurrence: Reoccurrence): Date | null;
  getReoccurrencesDue(maxDate: Date): CacheReoccurrence[];
}

export interface ForecastLoggingConfig {
  enabled: boolean;
  level?: "debug" | "info" | "warn" | "error";
}

export interface IRegisterEntryService {
  createEntry(params: CreateEntryParams): void;
  updateEntryStatuses(accountId: number): Promise<void>;
  calculateRunningBalances(
    entries: CacheRegisterEntry[],
    initialBalance: number,
    accountType: "credit" | "debit"
  ): CacheRegisterEntry[];
}

export interface ILoanCalculatorService {
  calculateInterestCharge(params: InterestCalculationParams): Promise<number>;
  calculateMinPayment(accountRegister: CacheAccountRegister): number;
  calculateInterestForAccount(
    accountRegister: CacheAccountRegister,
    projectedBalance?: number
  ): Promise<number>;
  shouldProcessInterest(
    accountRegister: CacheAccountRegister,
    forecastDate?: any
  ): boolean;
  isCreditAccount(typeId: number): boolean;
}

export interface ITransferService {
  transferBetweenAccounts(params: TransferParams): void;
  processExtraDebtPayments(
    sourceAccounts: CacheAccountRegister[],
    targetDate: Date
  ): Promise<void>;
  getAccountBalance(accountRegisterId: number): number;
}

/** Transaction client from prisma.$transaction(async (tx) => ...). Optional; when provided, persister uses it for all DB ops. */
export type ForecastTransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0];

export interface IDataPersisterService {
  convertOldProjectedToPending(
    accountId?: string,
    tx?: ForecastTransactionClient,
    budgetId?: number
  ): Promise<void>;
  persistForecastResults(
    results: CacheRegisterEntry[],
    tx?: ForecastTransactionClient
  ): Promise<Map<string, string>>;
  persistReoccurrenceLastAt(
    reoccurrences: CacheReoccurrence[],
    tx?: ForecastTransactionClient
  ): Promise<void>;
  cleanupProjectedEntries(
    accountId?: string,
    tx?: ForecastTransactionClient,
    budgetId?: number
  ): Promise<void>;
  updateAccountRegisterBalances(
    accountRegisters: CacheAccountRegister[],
    tx?: ForecastTransactionClient
  ): Promise<void>;
  updateRegisterEntryBalances(
    calculatedEntries: CacheRegisterEntry[],
    tx?: ForecastTransactionClient
  ): Promise<void>;
  /** Auto-apply past uncleared entries on pocket registers and transfer partners (recalculate only). */
  autoApplyPastPocketEntries(
    pocketRegisterIds: number[],
    tx?: ForecastTransactionClient,
  ): Promise<void>;
  batchUpdateStatementDates(
    updates: { id: number; statementAt: Date }[],
    tx?: ForecastTransactionClient
  ): Promise<void>;
}

export interface IValidationService {
  validateAccountData(data: AccountData): ValidationResult;
  validateForecastResults(results: ForecastResult): ValidationResult;
}

// Data Structures
export interface AccountData {
  accountRegisters: CacheAccountRegister[];
  registerEntries: CacheRegisterEntry[];
  reoccurrences: Reoccurrence[];
  reoccurrenceSkips: any[];
  minReoccurrenceDate: Date | null;
}

export interface CreateEntryParams {
  id?: string;
  accountRegisterId: number;
  sourceAccountRegisterId?: number;
  description: string;
  amount: number;
  reoccurrence?: Reoccurrence;
  manualCreatedAt?: Date;
  forecastDate?: Date; // Explicit forecast date for proper timeline placement
  isBalanceEntry?: boolean;
  isManualEntry?: boolean;
  /** When set (e.g. loading existing DB rows), overrides default projected flag */
  isProjected?: boolean;
  isPending?: boolean;
  typeId?: number; // RegisterEntryType ID
  categoryId?: string | null;
  reoccurrenceId?: number | null;
}

export interface TransferParams {
  targetAccountRegisterId: number;
  sourceAccountRegisterId: number;
  amount: number;
  description: string;
  reoccurrence?: Reoccurrence;
  fromDescription?: string;
  /** Applied only to the source/outflow register entry */
  categoryId?: string | null;
}

export interface InterestCalculationParams {
  typeId: number;
  apr: number;
  balance: number;
  totalYears: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Configuration
export interface ForecastConfiguration {
  maxYears: number;
  creditTypeIds: number[];
  defaultInterestCalculationMethod: "simple" | "compound" | "loan";
}

// Engine Interface
export interface IForecastEngine {
  recalculate(context: ForecastContext): Promise<ForecastResult>;
}
