import { describe, it, expect, beforeEach } from "vitest";
import type {
  CacheAccountRegister,
  CacheRegisterEntry,
  CacheReoccurrence,
  CacheReoccurrenceSkip,
} from "../ModernCacheService";
import { ModernCacheService } from "../ModernCacheService";
import { dateTimeService } from "../DateTimeService";

describe("ModernCacheService", () => {
  let cache: ModernCacheService;

  beforeEach(() => {
    cache = new ModernCacheService();
  });

  describe("Account Register Operations", () => {
    it("should insert and find account registers", () => {
      const account: CacheAccountRegister = {
        id: 1,
        subAccountRegisterId: null,
        typeId: 1,
        budgetId: 1,
        accountId: "test-account",
        name: "Test Account",
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
        accruesBalanceGrowth: false,
      };

      cache.accountRegister.insert(account);

      const found = cache.accountRegister.find({ id: 1 });
      expect(found).toHaveLength(1);
      expect(found[0]).toEqual(account);
    });

    it("should update account registers", () => {
      const account: CacheAccountRegister = {
        id: 1,
        subAccountRegisterId: null,
        typeId: 1,
        budgetId: 1,
        accountId: "test-account",
        name: "Test Account",
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
        accruesBalanceGrowth: false,
      };

      cache.accountRegister.insert(account);

      const updatedAccount = { ...account, balance: 1500 };
      cache.accountRegister.update(updatedAccount);

      const found = cache.accountRegister.find({ id: 1 });
      expect(found[0]?.balance).toBe(1500);
    });

    it("should remove account registers", () => {
      const account: CacheAccountRegister = {
        id: 1,
        subAccountRegisterId: null,
        typeId: 1,
        budgetId: 1,
        accountId: "test-account",
        name: "Test Account",
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
        accruesBalanceGrowth: false,
      };

      cache.accountRegister.insert(account);
      cache.accountRegister.remove({ id: 1 });

      const found = cache.accountRegister.find({ id: 1 });
      expect(found).toHaveLength(0);
    });
  });

  describe("Register Entry Operations", () => {
    it("should insert and find register entries", () => {
      const entry: CacheRegisterEntry = {
        id: "test-entry",
        seq: 1,
        accountRegisterId: 1,
        sourceAccountRegisterId: null,
        createdAt: dateTimeService.create().toDate(),
        description: "Test Entry",
        reoccurrenceId: null,
        amount: 100,
        balance: 1100,
        typeId: null,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
      };

      cache.registerEntry.insert(entry);

      const found = cache.registerEntry.find({ id: "test-entry" });
      expect(found).toHaveLength(1);
      expect(found[0]).toEqual(entry);
    });

    it("should update register entries", () => {
      const entry: CacheRegisterEntry = {
        id: "test-entry",
        seq: 1,
        accountRegisterId: 1,
        sourceAccountRegisterId: null,
        createdAt: dateTimeService.create().toDate(),
        description: "Test Entry",
        reoccurrenceId: null,
        amount: 100,
        balance: 1100,
        typeId: null,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
      };

      cache.registerEntry.insert(entry);

      const updatedEntry = { ...entry, amount: 150 };
      cache.registerEntry.update(updatedEntry);

      const found = cache.registerEntry.find({ id: "test-entry" });
      expect(found[0]?.amount).toBe(150);
    });

    it("should remove register entries", () => {
      const entry: CacheRegisterEntry = {
        id: "test-entry",
        seq: 1,
        accountRegisterId: 1,
        sourceAccountRegisterId: null,
        createdAt: dateTimeService.create().toDate(),
        description: "Test Entry",
        reoccurrenceId: null,
        amount: 100,
        balance: 1100,
        typeId: null,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
      };

      cache.registerEntry.insert(entry);
      cache.registerEntry.remove({ id: "test-entry" });

      const found = cache.registerEntry.find({ id: "test-entry" });
      expect(found).toHaveLength(0);
    });
  });

  describe("Reoccurrence Operations", () => {
    it("should insert and find reoccurrences", () => {
      const reoccurrence: CacheReoccurrence = {
        id: 1,
        accountId: "test-account",
        accountRegisterId: 1,
        intervalId: 1,
        transferAccountRegisterId: null,
        intervalCount: 1,
        lastAt: dateTimeService.create().toDate(),
        endAt: null,
        amount: 100,
        description: "Test Reoccurrence",
        totalIntervals: null,
        elapsedIntervals: null,
        updatedAt: dateTimeService.create().toDate(),
        adjustBeforeIfOnWeekend: false,
      };

      cache.reoccurrence.insert(reoccurrence);

      const found = cache.reoccurrence.find({ id: 1 });
      expect(found).toHaveLength(1);
      expect(found[0]).toEqual(reoccurrence);
    });

    it("should update reoccurrences", () => {
      const reoccurrence: CacheReoccurrence = {
        id: 1,
        accountId: "test-account",
        accountRegisterId: 1,
        intervalId: 1,
        transferAccountRegisterId: null,
        intervalCount: 1,
        lastAt: dateTimeService.create().toDate(),
        endAt: null,
        amount: 100,
        description: "Test Reoccurrence",
        totalIntervals: null,
        elapsedIntervals: null,
        updatedAt: dateTimeService.create().toDate(),
        adjustBeforeIfOnWeekend: false,
      };

      cache.reoccurrence.insert(reoccurrence);

      const updatedReoccurrence = { ...reoccurrence, amount: 150 };
      cache.reoccurrence.update(updatedReoccurrence);

      const found = cache.reoccurrence.find({ id: 1 });
      expect(found[0]?.amount).toBe(150);
    });

    it("should remove reoccurrences", () => {
      const reoccurrence: CacheReoccurrence = {
        id: 1,
        accountId: "test-account",
        accountRegisterId: 1,
        intervalId: 1,
        transferAccountRegisterId: null,
        intervalCount: 1,
        lastAt: dateTimeService.create().toDate(),
        endAt: null,
        amount: 100,
        description: "Test Reoccurrence",
        totalIntervals: null,
        elapsedIntervals: null,
        updatedAt: dateTimeService.create().toDate(),
        adjustBeforeIfOnWeekend: false,
      };

      cache.reoccurrence.insert(reoccurrence);
      cache.reoccurrence.remove({ id: 1 });

      const found = cache.reoccurrence.find({ id: 1 });
      expect(found).toHaveLength(0);
    });
  });

  describe("Reoccurrence Skip Operations", () => {
    it("should insert and find reoccurrence skips", () => {
      const skip: CacheReoccurrenceSkip = {
        id: 1,
        reoccurrenceId: 1,
        accountId: "test-account",
        accountRegisterId: 1,
        skippedAt: "2024-01-01",
      };

      cache.reoccurrenceSkip.insert(skip);

      const found = cache.reoccurrenceSkip.find({ id: 1 });
      expect(found).toHaveLength(1);
      expect(found[0]).toEqual(skip);
    });

    it("should update reoccurrence skips", () => {
      const skip: CacheReoccurrenceSkip = {
        id: 1,
        reoccurrenceId: 1,
        accountId: "test-account",
        accountRegisterId: 1,
        skippedAt: "2024-01-01",
      };

      cache.reoccurrenceSkip.insert(skip);

      const updatedSkip = { ...skip, skippedAt: "2024-01-02" };
      cache.reoccurrenceSkip.update(updatedSkip);

      const found = cache.reoccurrenceSkip.find({ id: 1 });
      expect(found[0]?.skippedAt).toBe("2024-01-02");
    });

    it("should remove reoccurrence skips", () => {
      const skip: CacheReoccurrenceSkip = {
        id: 1,
        reoccurrenceId: 1,
        accountId: "test-account",
        accountRegisterId: 1,
        skippedAt: "2024-01-01",
      };

      cache.reoccurrenceSkip.insert(skip);
      cache.reoccurrenceSkip.remove({ id: 1 });

      const found = cache.reoccurrenceSkip.find({ id: 1 });
      expect(found).toHaveLength(0);
    });
  });

  describe("Clear Operations", () => {
    it("should clear all collections", () => {
      // Insert some data
      const account: CacheAccountRegister = {
        id: 1,
        subAccountRegisterId: null,
        typeId: 1,
        budgetId: 1,
        accountId: "test-account",
        name: "Test Account",
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
        accruesBalanceGrowth: false,
      };

      const entry: CacheRegisterEntry = {
        id: "test-entry",
        seq: 1,
        accountRegisterId: 1,
        sourceAccountRegisterId: null,
        createdAt: dateTimeService.create().toDate(),
        description: "Test Entry",
        reoccurrenceId: null,
        amount: 100,
        balance: 1100,
        typeId: null,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
      };

      cache.accountRegister.insert(account);
      cache.registerEntry.insert(entry);

      // Clear all
      cache.clearAll();

      expect(cache.accountRegister.find({})).toHaveLength(0);
      expect(cache.registerEntry.find({})).toHaveLength(0);
      expect(cache.reoccurrence.find({})).toHaveLength(0);
      expect(cache.reoccurrenceSkip.find({})).toHaveLength(0);
    });
  });

  describe("Stats", () => {
    it("should return correct stats", () => {
      // Insert some data
      const account: CacheAccountRegister = {
        id: 1,
        subAccountRegisterId: null,
        typeId: 1,
        budgetId: 1,
        accountId: "test-account",
        name: "Test Account",
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
        accruesBalanceGrowth: false,
      };

      const entry: CacheRegisterEntry = {
        id: "test-entry",
        seq: 1,
        accountRegisterId: 1,
        sourceAccountRegisterId: null,
        createdAt: dateTimeService.create().toDate(),
        description: "Test Entry",
        reoccurrenceId: null,
        amount: 100,
        balance: 1100,
        typeId: null,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
      };

      cache.accountRegister.insert(account);
      cache.registerEntry.insert(entry);

      const stats = cache.getStats();
      expect(stats.accountRegisters).toBe(1);
      expect(stats.registerEntries).toBe(1);
      expect(stats.reoccurrences).toBe(0);
      expect(stats.reoccurrenceSkips).toBe(0);
    });
  });
});
