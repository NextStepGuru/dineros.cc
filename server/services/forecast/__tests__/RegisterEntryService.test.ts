import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient, Reoccurrence } from "@prisma/client";
import { RegisterEntryService } from "../RegisterEntryService";
import { ModernCacheService } from "../ModernCacheService";
import type { CacheAccountRegister } from "../ModernCacheService";
import { dateTimeService } from "../DateTimeService";

vi.mock("../../logger", () => ({
  log: vi.fn(),
}));

function minimalAccountRegister(
  overrides: Partial<CacheAccountRegister> = {},
): CacheAccountRegister {
  return {
    id: 1,
    typeId: 1,
    budgetId: 1,
    accountId: "acct-1",
    name: "Checking",
    balance: 1000,
    latestBalance: 1000,
    minPayment: null,
    statementAt: dateTimeService.create().toDate(),
    statementIntervalId: 1,
    apr1: null,
    apr1StartAt: null,
    apr2: null,
    apr2StartAt: null,
    apr3: null,
    apr3StartAt: null,
    targetAccountRegisterId: null,
    loanStartAt: null,
    loanPaymentsPerYear: null,
    loanTotalYears: null,
    loanOriginalAmount: null,
    loanPaymentSortOrder: 0,
    savingsGoalSortOrder: 0,
    accountSavingsGoal: null,
    minAccountBalance: 0,
    allowExtraPayment: false,
    isArchived: false,
    plaidId: null,
    depreciationRate: null,
    depreciationMethod: null,
    assetOriginalValue: null,
    assetResidualValue: null,
    assetUsefulLifeYears: null,
    assetStartAt: null,
    paymentCategoryId: null,
    interestCategoryId: null,
    ...overrides,
  };
}

/** Synthetic loan-payment reoccurrence uses id 0 in memory; DB must get null FK (regression: id 0 violated reoccurrence FK and rows were dropped on persist). */
function syntheticLoanReoccurrence(
  overrides: Partial<Reoccurrence> = {},
): Reoccurrence {
  return {
    id: 0,
    accountId: "",
    accountRegisterId: 1,
    description: "Payment to Loan",
    lastAt: dateTimeService.nowDate(),
    amount: {} as Reoccurrence["amount"],
    transferAccountRegisterId: 2,
    intervalId: 3,
    intervalCount: 1,
    endAt: null,
    totalIntervals: null,
    elapsedIntervals: null,
    updatedAt: dateTimeService.nowDate(),
    adjustBeforeIfOnWeekend: false,
    categoryId: null,
    intervalName: null,
    lastRunAt: null,
    ...overrides,
  } as Reoccurrence;
}

describe("RegisterEntryService.createEntry", () => {
  let cache: ModernCacheService;
  let service: RegisterEntryService;
  const db = {} as PrismaClient;

  beforeEach(() => {
    cache = new ModernCacheService();
    cache.accountRegister.insert(minimalAccountRegister());
    service = new RegisterEntryService(db, cache);
  });

  it("stores reoccurrenceId null when synthetic reoccurrence has id 0 (loan schedule stub)", () => {
    const future = dateTimeService.createUTC("2030-06-15").toDate();
    service.createEntry({
      accountRegisterId: 1,
      description: "Transfer for Payment to RV",
      amount: -100,
      typeId: 6,
      forecastDate: future,
      sourceAccountRegisterId: 9,
      reoccurrence: syntheticLoanReoccurrence(),
    });
    const inserted = cache.registerEntry.find({ accountRegisterId: 1 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.reoccurrenceId).toBeNull();
  });

  it("preserves a real reoccurrence id when non-zero", () => {
    const future = dateTimeService.createUTC("2030-06-15").toDate();
    service.createEntry({
      accountRegisterId: 1,
      description: "Transfer for Fuel",
      amount: -50,
      typeId: 6,
      forecastDate: future,
      reoccurrence: syntheticLoanReoccurrence({ id: 42 }),
    });
    const inserted = cache.registerEntry.find({ accountRegisterId: 1 });
    expect(inserted[0]!.reoccurrenceId).toBe(42);
  });

  it("uses explicit reoccurrenceId param when provided (overrides reoccurrence.id)", () => {
    const future = dateTimeService.createUTC("2030-06-15").toDate();
    service.createEntry({
      accountRegisterId: 1,
      description: "X",
      amount: -1,
      typeId: 6,
      forecastDate: future,
      reoccurrenceId: 99,
      reoccurrence: syntheticLoanReoccurrence({ id: 0 }),
    });
    const inserted = cache.registerEntry.find({ accountRegisterId: 1 });
    expect(inserted[0]!.reoccurrenceId).toBe(99);
  });

  it("stores null when there is no reoccurrence object", () => {
    const future = dateTimeService.createUTC("2030-06-15").toDate();
    service.createEntry({
      accountRegisterId: 1,
      description: "Plain projected",
      amount: -10,
      typeId: 9,
      forecastDate: future,
    });
    const inserted = cache.registerEntry.find({ accountRegisterId: 1 });
    expect(inserted[0]!.reoccurrenceId).toBeNull();
  });
});
