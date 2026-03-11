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
}

export interface IReoccurrenceService {
  processReoccurrences(
    reoccurrences: Reoccurrence[],
    endDate: Date
  ): Promise<void>;
  calculateNextOccurrence(reoccurrence: Reoccurrence): Date | null;
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

export interface IDataPersisterService {
  convertOldProjectedToPending(accountId?: string): Promise<void>;
  persistForecastResults(
    results: CacheRegisterEntry[]
  ): Promise<Map<string, string>>;
  persistReoccurrenceLastAt(
    reoccurrences: CacheReoccurrence[]
  ): Promise<void>;
  cleanupProjectedEntries(accountId?: string): Promise<void>;
  updateAccountRegisterBalances(accountId: string): Promise<void>;
  updateRegisterEntryBalances(
    calculatedEntries: CacheRegisterEntry[]
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
  isPending?: boolean;
  typeId?: number; // RegisterEntryType ID
}

export interface TransferParams {
  targetAccountRegisterId: number;
  sourceAccountRegisterId: number;
  amount: number;
  description: string;
  reoccurrence?: Reoccurrence;
  fromDescription?: string;
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
