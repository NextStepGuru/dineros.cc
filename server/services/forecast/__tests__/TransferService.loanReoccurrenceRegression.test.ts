import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient, Reoccurrence } from "@prisma/client";
import { TransferService } from "../TransferService";
import { RegisterEntryService } from "../RegisterEntryService";
import { ModernCacheService } from "../ModernCacheService";
import { dateTimeService } from "../DateTimeService";

vi.mock("../../logger", () => ({
  log: vi.fn(),
}));

function baseAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    typeId: 1,
    budgetId: 1,
    accountId: "acct-1",
    name: "Payer",
    balance: 10000,
    latestBalance: 10000,
    minPayment: null,
    statementAt: dateTimeService.create("2024-01-15").toDate(),
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
    ...overrides,
  };
}

describe("TransferService + RegisterEntryService loan synthetic reoccurrence id 0", () => {
  let cache: ModernCacheService;
  let entryService: RegisterEntryService;
  let transfer: TransferService;
  const db = {} as PrismaClient;

  beforeEach(() => {
    cache = new ModernCacheService();
    cache.accountRegister.insert(baseAccount({ id: 1, name: "Checking" }) as any);
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "RV Loan",
        typeId: 5,
        balance: -5000,
        latestBalance: -5000,
        targetAccountRegisterId: 1,
      }) as any,
    );
    entryService = new RegisterEntryService(db, cache);
    transfer = new TransferService(cache, entryService);
  });

  it("both transfer legs store reoccurrenceId null when reoccurrence stub uses id 0", () => {
    const forecastDate = dateTimeService.createUTC("2030-04-15").toDate();
    const synthetic: Reoccurrence = {
      id: 0,
      accountId: "",
      accountRegisterId: 2,
      description: "Payment to RV Loan",
      lastAt: dateTimeService.nowDate(),
      amount: {} as Reoccurrence["amount"],
      transferAccountRegisterId: 1,
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
    } as Reoccurrence;

    transfer.transferBetweenAccountsWithDate({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 150,
      description: "Payment to RV Loan",
      forecastDate,
      reoccurrence: synthetic,
    });

    const leg1 = cache.registerEntry.find({ accountRegisterId: 1 });
    const leg2 = cache.registerEntry.find({ accountRegisterId: 2 });
    expect(leg1.length).toBe(1);
    expect(leg2.length).toBe(1);
    expect(leg1[0]!.reoccurrenceId).toBeNull();
    expect(leg2[0]!.reoccurrenceId).toBeNull();
    expect(leg2[0]!.description).toBe("Payment to RV Loan");
    expect(leg1[0]!.description).toBe("Transfer for Payment to RV Loan");
    expect(leg1[0]!.typeId).toBe(6);
    expect(leg2[0]!.typeId).toBe(6);
  });
});
