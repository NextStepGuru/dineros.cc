import { describe, it, expect, beforeEach } from "vitest";
import { LoanCalculatorService } from "../LoanCalculatorService";
import type { CacheAccountRegister } from "../ModernCacheService";
import { dateTimeService } from "../DateTimeService";

function createAccount(
  overrides: Partial<CacheAccountRegister> = {},
): CacheAccountRegister {
  return {
    id: 1,
    subAccountRegisterId: null,
    typeId: 5,
    budgetId: 1,
    accountId: "acct",
    name: "Loan",
    balance: -8000,
    latestBalance: -8000,
    minPayment: 200,
    statementAt: new Date("2024-02-15T00:00:00.000Z"),
    statementIntervalId: 3,
    apr1: 0.06,
    apr1StartAt: new Date("2020-01-01T00:00:00.000Z"),
    apr2: null,
    apr2StartAt: null,
    apr3: null,
    apr3StartAt: null,
    targetAccountRegisterId: 2,
    loanStartAt: new Date("2020-01-01T00:00:00.000Z"),
    loanPaymentsPerYear: 12,
    loanTotalYears: 30,
    loanOriginalAmount: 20000,
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
    accruesBalanceGrowth: false,
    ...overrides,
  };
}

describe("LoanCalculatorService", () => {
  let service: LoanCalculatorService;

  beforeEach(() => {
    service = new LoanCalculatorService();
  });

  describe("strict APR tier resolution", () => {
    it("uses APR1 only when APR1 start date is active", async () => {
      const account = createAccount({
        apr1: 0.06,
        apr1StartAt: new Date("2024-02-01T00:00:00.000Z"),
        statementAt: new Date("2024-02-15T00:00:00.000Z"),
      });

      const interest = await service.calculateInterestForAccount(account);
      expect(interest).toBe(-39.55);
    });

    it("returns 0 when no APR tier start date is active", async () => {
      const account = createAccount({
        apr1: 0.06,
        apr1StartAt: new Date("2024-03-01T00:00:00.000Z"),
        apr2: 0.08,
        apr2StartAt: new Date("2024-04-01T00:00:00.000Z"),
        apr3: 0.12,
        apr3StartAt: new Date("2024-05-01T00:00:00.000Z"),
        statementAt: new Date("2024-02-15T00:00:00.000Z"),
      });

      const interest = await service.calculateInterestForAccount(account);
      expect(interest).toBe(0);
    });

    it("uses highest active tier between APR2/APR3", async () => {
      const account = createAccount({
        apr1: 0.06,
        apr1StartAt: new Date("2020-01-01T00:00:00.000Z"),
        apr2: 0.12,
        apr2StartAt: new Date("2024-01-01T00:00:00.000Z"),
        apr3: 0.24,
        apr3StartAt: new Date("2024-02-01T00:00:00.000Z"),
        statementAt: new Date("2024-02-15T00:00:00.000Z"),
      });

      const interest = await service.calculateInterestForAccount(account);
      expect(interest).toBe(-159.32);
    });
  });

  describe("amortized payment calculation", () => {
    it("uses amortized PI amount for mortgage/loan types", () => {
      const account = createAccount({
        typeId: 6,
      });

      const payment = service.calculatePaymentAmount(
        account,
        -39.52,
        -8039.52,
        new Date("2024-02-15T00:00:00.000Z"),
      );

      expect(payment).toBe(126.91);
    });

    it("handles zero APR deterministically using principal/remaining periods", () => {
      const account = createAccount({
        apr1: 0,
        apr1StartAt: new Date("2020-01-01T00:00:00.000Z"),
      });

      const payment = service.calculatePaymentAmount(
        account,
        0,
        -8000,
        new Date("2024-02-15T00:00:00.000Z"),
      );

      // Elapsed ~49 payments from 2020-01-01 to 2024-02-15 => remaining 311
      expect(payment).toBeCloseTo(64.31, 2);
    });

    it("falls back to legacy min/interest behavior when loan fields are incomplete", () => {
      const account = createAccount({
        loanOriginalAmount: null,
        loanPaymentsPerYear: null,
      });

      const payment = service.calculatePaymentAmount(
        account,
        -39.52,
        -8039.52,
        new Date("2024-02-15T00:00:00.000Z"),
      );

      expect(payment).toBe(200);
    });

    it("returns 0 before loanStartAt", () => {
      const account = createAccount({
        loanStartAt: new Date("2025-01-01T00:00:00.000Z"),
      });

      const payment = service.calculatePaymentAmount(
        account,
        -39.52,
        -8039.52,
        new Date("2024-02-15T00:00:00.000Z"),
      );

      expect(payment).toBe(0);
    });
  });

  describe("shouldProcessInterest", () => {
    it("requires an active APR tier on statement date", () => {
      const account = createAccount({
        statementAt: new Date("2024-02-15T00:00:00.000Z"),
        apr1StartAt: new Date("2024-03-01T00:00:00.000Z"),
      });
      const forecastDate = dateTimeService.create("2024-02-15T00:00:00.000Z");

      const shouldProcess = service.shouldProcessInterest(
        account,
        forecastDate,
      );
      expect(shouldProcess).toBe(false);
    });
  });
});
