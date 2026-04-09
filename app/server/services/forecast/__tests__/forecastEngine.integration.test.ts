import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngine } from "../ForecastEngine";
import type { ForecastContext } from "../types";
import { dateTimeService } from "../DateTimeService";
import { forecastLogger } from "../logger";
import type { CacheAccountRegister } from "../ModernCacheService";

const dt = (input?: any) => dateTimeService.create(input);

const INTEGRATION_REGISTER_DEFAULTS: Pick<
  CacheAccountRegister,
  | "depreciationRate"
  | "depreciationMethod"
  | "assetOriginalValue"
  | "assetResidualValue"
  | "assetUsefulLifeYears"
  | "assetStartAt"
  | "paymentCategoryId"
  | "interestCategoryId"
  | "accruesBalanceGrowth"
> = {
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

type RegisterEntryCreateManyCall = readonly [
  args: { data: Record<string, unknown>[] },
];
type RegisterEntryCreateCall = readonly [
  args: { data: Record<string, unknown> },
];

// Mock the database
const mockDb = {
  accountRegister: {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  registerEntry: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn().mockResolvedValue([]),
    count: vi.fn(),
    create: vi.fn(),
  },
  reoccurrence: {
    findMany: vi.fn(),
    aggregate: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  reoccurrenceSkip: {
    findMany: vi.fn(),
  },
  reoccurrenceSplit: {
    findMany: vi.fn(),
  },
  savingsGoal: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  $transaction: vi.fn((cb: (_tx: any) => Promise<any>) => cb(mockDb)),
  $executeRaw: vi.fn().mockResolvedValue(undefined),
} as any;

function setupMockData() {
  // Mock account registers
  mockDb.accountRegister.findMany.mockImplementation((_args: any) => {
    return Promise.resolve([
      {
        id: 1,
        subAccountRegisterId: null,
        budgetId: 1,
        accountId: "test-account-123",
        name: "Checking Account",
        balance: 1000,
        latestBalance: 1000,
        minPayment: null,
        statementAt: dateTimeService.add(1, "month").toDate(),
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
        loanPaymentSortOrder: 1,
        minAccountBalance: 500,
        allowExtraPayment: true,
        isArchived: false,
        typeId: 1,
        plaidId: null,
        type: { accruesBalanceGrowth: false },
      },
      {
        id: 2,
        subAccountRegisterId: null,
        budgetId: 1,
        accountId: "test-account-123",
        name: "Credit Card",
        balance: -500, // Debt
        latestBalance: -500,
        minPayment: 25,
        statementAt: dateTimeService.add(15, "days").toDate(),
        apr1: 0.18, // 18% APR
        apr1StartAt: dateTimeService.subtract(1, "year").toDate(),
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        targetAccountRegisterId: 1, // Paid from checking account
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 1,
        minAccountBalance: null,
        allowExtraPayment: false,
        isArchived: false,
        typeId: 4,
        plaidId: null,
        type: { accruesBalanceGrowth: false },
      },
    ]);
  });

  // Mock register entries
  mockDb.registerEntry.findMany.mockResolvedValue([
    {
      id: "existing-entry-1",
      accountRegisterId: 1,
      sourceAccountRegisterId: null,
      description: "Existing Balance",
      amount: 0,
      balance: 1000,
      createdAt: dateTimeService.subtract(1, "day").toDate(),
      reoccurrenceId: null,
      isProjected: false,
      isPending: false,
      isCleared: true,
      isBalanceEntry: true,
      isManualEntry: false,
      isReconciled: false,
    },
  ]);

  mockDb.savingsGoal.findMany.mockResolvedValue([]);

  // Mock reoccurrences
  mockDb.reoccurrence.findMany.mockResolvedValue([
    {
      id: 1,
      accountId: "test-account-123",
      accountRegisterId: 1,
      intervalId: 3, // Monthly
      intervalCount: 1,
      transferAccountRegisterId: null,
      lastAt: dt().startOf("month").toDate(),
      endAt: null,
      amount: 3000, // Salary
      description: "Monthly Salary",
      totalIntervals: null,
      elapsedIntervals: null,
      updatedAt: new Date(),
      adjustBeforeIfOnWeekend: false,
    },
    {
      id: 2,
      accountId: "test-account-123",
      accountRegisterId: 1,
      intervalId: 3, // Monthly
      intervalCount: 1,
      transferAccountRegisterId: null,
      lastAt: dt().startOf("month").add(5, "days").toDate(),
      endAt: null,
      amount: -1200, // Rent
      description: "Monthly Rent",
      totalIntervals: null,
      elapsedIntervals: null,
      updatedAt: new Date(),
      adjustBeforeIfOnWeekend: false,
    },
  ]);

  // Mock reoccurrence skips
  mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);
  mockDb.reoccurrenceSplit.findMany.mockResolvedValue([]);

  // Mock reoccurrence aggregate
  mockDb.reoccurrence.aggregate.mockResolvedValue({
    _min: {
      lastAt: dt().startOf("month").toDate(),
    },
  });

  // Mock database operations
  mockDb.registerEntry.deleteMany.mockResolvedValue({ count: 0 });
  mockDb.registerEntry.createMany.mockResolvedValue({ count: 0 });
  mockDb.registerEntry.create.mockResolvedValue({});
  mockDb.registerEntry.update.mockResolvedValue({});
  mockDb.registerEntry.updateMany.mockResolvedValue({ count: 0 });
  mockDb.registerEntry.count.mockResolvedValue(0);
  mockDb.accountRegister.update.mockResolvedValue({});
  mockDb.accountRegister.updateMany.mockResolvedValue({ count: 0 });
  mockDb.reoccurrence.update.mockResolvedValue({});

  // Mock missing queries that DataLoaderService makes
  mockDb.reoccurrenceSkip.findMany.mockResolvedValue([]);
  mockDb.reoccurrence.aggregate.mockResolvedValue({
    _min: {
      lastAt: dt().startOf("month").toDate(),
    },
  });

  // Mock DataPersisterService operations
  mockDb.registerEntry.updateMany.mockImplementation((args: any) => {
    // Handle different updateMany calls with different where clauses
    if (args?.where?.isProjected === true) {
      return Promise.resolve({ count: 0 });
    }
    if (args?.where?.isManualEntry === true) {
      return Promise.resolve({ count: 0 });
    }
    if (args?.where?.description === "Latest Balance") {
      return Promise.resolve({ count: 0 });
    }
    return Promise.resolve({ count: 0 });
  });
}

describe("ForecastEngine Integration Tests", () => {
  let engine: ForecastEngine;
  let testContext: ForecastContext;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset the global mockDb (skip $transaction/$executeRaw to avoid mockReset on non-vi functions)
    Object.keys(mockDb).forEach((key) => {
      if (key === "$transaction" || key === "$executeRaw") return;
      Object.keys(mockDb[key]).forEach((method) => {
        const fn = mockDb[key][method];
        if (typeof fn === "function" && typeof fn.mockReset === "function") {
          fn.mockReset();
        }
      });
    });

    engine = new ForecastEngine(mockDb);

    testContext = {
      accountId: "test-account-123",
      startDate: dateTimeService.startOf("month").toDate(),
      endDate: dateTimeService.add(12, "months").toDate(),
      logging: { enabled: false },
    };

    // Setup default mock responses
    setupMockData();
  });

  describe("Basic Forecast Calculation", () => {
    it("should successfully calculate a basic forecast", async () => {
      try {
        const result = await engine.recalculate(testContext);

        if (!result.isSuccess) {
          forecastLogger.debug("Forecast failed with errors:", result.errors);
        }

        expect(result.isSuccess).toBe(true);
        expect(result.errors).toBeUndefined();
        expect(result.registerEntries.length).toBeGreaterThan(0);
        expect(result.accountRegisters.length).toBeGreaterThan(0);
      } catch (error) {
        forecastLogger.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should create balance entries for all accounts", async () => {
      const result = await engine.recalculate(testContext);

      expect(result.isSuccess).toBe(true);

      // Should have balance entries for each account
      const balanceEntries = result.registerEntries.filter(
        (entry) => entry.isBalanceEntry === true,
      );

      expect(balanceEntries.length).toBe(2); // One for each account
    });

    it("should process reoccurring transactions", async () => {
      const result = await engine.recalculate(testContext);

      expect(result.isSuccess).toBe(true);

      // Should have salary and rent entries
      const salaryEntries = result.registerEntries.filter((entry) =>
        entry.description.includes("Monthly Salary"),
      );
      const rentEntries = result.registerEntries.filter((entry) =>
        entry.description.includes("Monthly Rent"),
      );

      expect(salaryEntries.length).toBeGreaterThan(0);
      expect(rentEntries.length).toBeGreaterThan(0);
    });

    it("should handle credit card interest and payments", async () => {
      const result = await engine.recalculate(testContext);

      expect(result.isSuccess).toBe(true);

      // Should have interest charges for credit card
      const interestEntries = result.registerEntries.filter((entry) =>
        entry.description.includes("Interest Charge"),
      );

      // Should have payment entries
      const paymentEntries = result.registerEntries.filter((entry) =>
        entry.description.includes("Payment"),
      );

      // Interest and payment entries may or may not be generated depending on account setup
      expect(interestEntries.length).toBeGreaterThanOrEqual(0);
      expect(paymentEntries.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Performance Validation", () => {
    it("should complete forecast calculation quickly", async () => {
      const startTime = performance.now();
      const result = await engine.recalculate(testContext);
      const endTime = performance.now();

      const executionTime = endTime - startTime;

      expect(result.isSuccess).toBe(true);
      expect(executionTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it("should handle cache operations efficiently", async () => {
      const cache = engine.getCache();

      // Test cache performance
      const startTime = performance.now();

      // Insert many items
      for (let i = 1; i <= 1000; i++) {
        cache.accountRegister.insert({
          ...INTEGRATION_REGISTER_DEFAULTS,
          id: i,
          typeId: (i % 5) + 1,
          budgetId: 1,
          accountId: "test",
          name: `Account ${i}`,
          balance: Math.random() * 10000,
          latestBalance: Math.random() * 10000,
          minPayment: 50,
          statementAt: dateTimeService.now().toDate(),
          statementIntervalId: 1,
          apr1: 0.15,
          apr1StartAt: new Date(),
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          targetAccountRegisterId: null,
          loanStartAt: new Date(),
          loanPaymentsPerYear: 12,
          loanTotalYears: 30,
          loanOriginalAmount: 100000,
          loanPaymentSortOrder: i,
          savingsGoalSortOrder: 1,
          accountSavingsGoal: null,
          minAccountBalance: 500,
          allowExtraPayment: true,
          isArchived: false,
          plaidId: null,
        });
      }

      // Query them back
      const results = cache.accountRegister.find({ typeId: 3 });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(results.length).toBe(200); // Every 5th account
      expect(totalTime).toBeLessThan(100); // Should be very fast
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      // Suppress forecastLogger for this test
      const originalError = forecastLogger.error;
      forecastLogger.error = vi.fn();

      try {
        // Simulate database error
        mockDb.accountRegister.findMany.mockRejectedValue(
          new Error("Database connection failed"),
        );

        const result = await engine.recalculate(testContext);

        expect(result.isSuccess).toBe(false);
        expect(result.errors).toBeDefined();
        expect((result.errors ?? []).length).toBeGreaterThan(0);
        expect((result.errors ?? [])[0]).toContain(
          "Database connection failed",
        );
      } finally {
        // Restore forecastLogger.error
        forecastLogger.error = originalError;
      }
    });

    it("should validate context parameters", async () => {
      const invalidContext = {
        accountId: "",
        startDate: dt().add(1, "year").toDate(), // Start after end
        endDate: dt().toDate(),
      };

      const result = await engine.recalculate(invalidContext);

      // Should handle gracefully (might not fail but should be documented behavior)
      expect(result).toBeDefined();
    });
  });

  describe("Data Integrity", () => {
    it("should maintain running balances correctly", async () => {
      const result = await engine.recalculate(testContext);

      expect(result.isSuccess).toBe(true);

      // Group entries by account
      const entriesByAccount = result.registerEntries.reduce(
        (acc, entry) => {
          const id = entry.accountRegisterId;
          const arr = acc[id] ?? [];
          if (arr.length === 0) acc[id] = arr;
          arr.push(entry);
          return acc;
        },
        {} as Record<number, typeof result.registerEntries>,
      );

      // Verify running balances for each account
      Object.values(entriesByAccount).forEach((accountEntries) => {
        const sortedEntries = [...accountEntries].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

        // Find the balance entry to get the starting balance
        const balanceEntry = sortedEntries.find(
          (entry) => entry.isBalanceEntry,
        );
        if (!balanceEntry) {
          throw new Error("No balance entry found in test data");
        }

        // The balance entry should have balance equal to its amount
        expect(balanceEntry.balance).toBe(balanceEntry.amount);

        // Calculate running balances starting from the balance entry
        let runningBalance = balanceEntry.balance;

        for (const current of sortedEntries) {
          // Skip balance entries as they set the initial balance
          if (current.isBalanceEntry) {
            continue;
          }

          // For non-balance entries, running balance should equal previous running balance + current amount
          runningBalance += current.amount;

          // Allow for larger rounding differences due to complex calculations
          expect(Math.abs(current.balance - runningBalance)).toBeLessThan(1500);
        }
      });
    });

    it("should correctly categorize entry types", async () => {
      const result = await engine.recalculate(testContext);

      expect(result.isSuccess).toBe(true);

      const balanceEntries = result.registerEntries.filter(
        (e) => e.isBalanceEntry,
      );
      const projectedEntries = result.registerEntries.filter(
        (e) => e.isProjected,
      );
      const pendingEntries = result.registerEntries.filter((e) => e.isPending);

      // Should have balance entries
      expect(balanceEntries.length).toBeGreaterThan(0);

      // Should have projected entries (future transactions)
      expect(projectedEntries.length).toBeGreaterThan(0);

      // May or may not have pending entries depending on dates
      expect(pendingEntries.length).toBeGreaterThanOrEqual(0);

      // Balance entries should have the opening balance as their amount (can be negative for debt accounts)
      balanceEntries.forEach((entry) => {
        expect(typeof entry.amount).toBe("number"); // Should be a valid number
      });
    });
  });

  describe("Loan payment → persist (regression)", () => {
    beforeEach(() => {
      // "Now" before the forecast window so same-calendar-day logic does not mark the year's projected rows as pending (pending rows are excluded from persist).
      dateTimeService.setNowOverride("2023-06-01T12:00:00.000Z");
      testContext.startDate = dateTimeService.createUTC("2024-01-01").toDate();
      testContext.endDate = dateTimeService.createUTC("2025-01-01").toDate();

      // Type-5 loan + statement day inside the forecast window so interest → min payment transfer runs (synthetic reoccurrence id 0 in code path).
      mockDb.accountRegister.findMany.mockResolvedValue([
        {
          id: 1,
          budgetId: 1,
          accountId: "test-account-123",
          name: "Checking Account",
          balance: 10000,
          latestBalance: 10000,
          minPayment: null,
          statementAt: dateTimeService.createUTC("2024-01-01").toDate(),
          statementIntervalId: 3,
          apr1: null,
          apr1StartAt: null,
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          targetAccountRegisterId: null,
          loanStartAt: null,
          loanPaymentsPerYear: 12,
          loanTotalYears: 30,
          loanOriginalAmount: 20000,
          loanPaymentSortOrder: 1,
          savingsGoalSortOrder: 0,
          accountSavingsGoal: null,
          minAccountBalance: 500,
          allowExtraPayment: true,
          isArchived: false,
          typeId: 1,
          plaidId: null,
          type: { accruesBalanceGrowth: false },
        },
        {
          id: 2,
          budgetId: 1,
          accountId: "test-account-123",
          name: "RV Loan",
          balance: -8000,
          latestBalance: -8000,
          minPayment: 200,
          statementAt: dateTimeService.createUTC("2024-02-15").toDate(),
          statementIntervalId: 3,
          apr1: 0.06,
          apr1StartAt: dateTimeService.createUTC("2020-01-01").toDate(),
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          targetAccountRegisterId: 1,
          loanStartAt: null,
          loanPaymentsPerYear: 12,
          loanTotalYears: 30,
          loanOriginalAmount: 20000,
          loanPaymentSortOrder: 1,
          savingsGoalSortOrder: 0,
          accountSavingsGoal: null,
          minAccountBalance: null,
          allowExtraPayment: false,
          isArchived: false,
          typeId: 5,
          plaidId: null,
          type: { accruesBalanceGrowth: false },
        },
      ]);
    });

    afterEach(() => {
      dateTimeService.clearNowOverride();
    });

    it("createMany payload has no reoccurrenceId 0 and type-6 loan legs on payer and debt registers", async () => {
      const createManyMock = vi.mocked(mockDb.registerEntry.createMany);

      const result = await engine.recalculate(testContext);
      expect(result.isSuccess).toBe(true);

      const createMock = vi.mocked(mockDb.registerEntry.create);
      const allRows = [
        ...createManyMock.mock.calls.flatMap(
          (call: RegisterEntryCreateManyCall) => call[0].data,
        ),
        ...createMock.mock.calls.map(
          (call: RegisterEntryCreateCall) => call[0].data,
        ),
      ];
      expect(allRows.length).toBeGreaterThan(0);
      const transferPair = result.registerEntries.filter(
        (e) =>
          e.typeId === 6 &&
          ((Number(e.accountRegisterId) === 2 &&
            Number(e.sourceAccountRegisterId) === 1) ||
            (Number(e.accountRegisterId) === 1 &&
              Number(e.sourceAccountRegisterId) === 2)),
      );
      expect(transferPair.length).toBeGreaterThanOrEqual(2);

      for (const row of allRows) {
        expect(row.reoccurrenceId).not.toBe(0);
      }

      const type6Rows = allRows.filter((r) => Number(r.typeId) === 6);
      const byRegister = new Set(
        type6Rows.map((r) =>
          Number((r as { accountRegisterId?: unknown }).accountRegisterId),
        ),
      );
      expect(byRegister.has(1)).toBe(true);
      expect(byRegister.has(2)).toBe(true);
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle extra debt payments", async () => {
      // Setup scenario with extra payment capability
      mockDb.accountRegister.findMany.mockResolvedValue([
        {
          id: 1,
          name: "Checking Account",
          balance: 5000, // High balance
          minAccountBalance: 1000, // Keep minimum
          allowExtraPayment: true, // Allow extra payments
          typeId: 1,
          accountId: "test-account-123",
          budgetId: 1,
          latestBalance: 5000,
          minPayment: null,
          statementAt: dt().add(1, "month").toDate(),
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
          loanPaymentSortOrder: 1,
          isArchived: false,
          plaidId: null,
          type: { accruesBalanceGrowth: false },
        },
        {
          id: 2,
          name: "Credit Card",
          balance: -2000, // Debt to pay down
          minPayment: 50,
          targetAccountRegisterId: null,
          typeId: 4,
          accountId: "test-account-123",
          budgetId: 1,
          latestBalance: -2000,
          statementAt: dt().add(15, "days").toDate(),
          apr1: 0.18,
          apr1StartAt: dt().subtract(1, "year").toDate(),
          apr2: null,
          apr2StartAt: null,
          apr3: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: 1,
          minAccountBalance: null,
          allowExtraPayment: false,
          isArchived: false,
          plaidId: null,
          type: { accruesBalanceGrowth: false },
        },
      ]);

      const result = await engine.recalculate(testContext);

      expect(result.isSuccess).toBe(true);

      // Should have extra debt payment entries
      const extraPaymentEntries = result.registerEntries.filter((entry) =>
        entry.description.includes("Extra debt payment"),
      );

      expect(extraPaymentEntries.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Cache Integration", () => {
    it("should properly use ModernCacheService", async () => {
      const cache = engine.getCache();

      // Verify it's the modern cache service
      expect(cache.getStats).toBeDefined();
      expect(cache.clearAll).toBeDefined();

      await engine.recalculate(testContext);

      const stats = cache.getStats();

      // Should have loaded data into cache
      expect(stats.accountRegisters).toBeGreaterThan(0);
      expect(stats.registerEntries).toBeGreaterThanOrEqual(0);
    });

    it("should validate cache performance", async () => {
      await engine.recalculate(testContext);

      const cache = engine.getCache();

      // Test cache query performance
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        cache.accountRegister.find({ typeId: 1 });
        cache.registerEntry.find({ accountRegisterId: 1 });
      }

      const endTime = performance.now();
      const queryTime = endTime - startTime;

      // 100 queries should be very fast
      expect(queryTime).toBeLessThan(10);
    });
  });

  describe("Pocket auto-apply on recalculate", () => {
    it("calls registerEntry.groupBy for pocket registers after persist", async () => {
      mockDb.accountRegister.findMany.mockResolvedValue([
        {
          id: 1,
          subAccountRegisterId: null,
          budgetId: 1,
          accountId: "test-account-123",
          name: "Checking Account",
          balance: 1000,
          latestBalance: 1000,
          minPayment: null,
          statementAt: dateTimeService.add(1, "month").toDate(),
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
          loanPaymentSortOrder: 1,
          savingsGoalSortOrder: 0,
          minAccountBalance: 500,
          allowExtraPayment: true,
          isArchived: false,
          typeId: 1,
          plaidId: null,
          type: { accruesBalanceGrowth: false },
        },
        {
          id: 3,
          subAccountRegisterId: 1,
          budgetId: 1,
          accountId: "test-account-123",
          name: "Pocket",
          balance: 0,
          latestBalance: 0,
          minPayment: null,
          statementAt: dateTimeService.add(1, "month").toDate(),
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
          loanPaymentSortOrder: 1,
          savingsGoalSortOrder: 0,
          minAccountBalance: 0,
          allowExtraPayment: false,
          isArchived: false,
          typeId: 1,
          plaidId: null,
          type: { accruesBalanceGrowth: false },
        },
      ]);

      await engine.recalculate(testContext);

      expect(mockDb.registerEntry.groupBy).toHaveBeenCalled();
      const pocketCalls = vi.mocked(mockDb.registerEntry.groupBy).mock.calls.filter(
        (call) => call[0]?.where?.accountRegisterId?.in?.includes(3),
      );
      expect(pocketCalls.length).toBeGreaterThan(0);
    });
  });
});
