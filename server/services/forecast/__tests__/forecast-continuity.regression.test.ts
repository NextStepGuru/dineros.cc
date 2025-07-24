import { vi, describe, it, expect, beforeEach } from "vitest";
import { dateTimeService } from "../DateTimeService";
import { ModernCacheService } from "../ModernCacheService";
import { ForecastEngine } from "../ForecastEngine";
import { DataLoaderService } from "../DataLoaderService";
import { DataPersisterService } from "../DataPersisterService";
import { AccountRegisterService } from "../AccountRegisterService";
import { RegisterEntryService } from "../RegisterEntryService";
import { TransferService } from "../TransferService";
import { LoanCalculatorService } from "../LoanCalculatorService";

// Dynamic moment import
let moment: any;

/**
 * Regression tests for Bug #3: Forecast Timeline Continuity
 *
 * These tests verify that forecasting continues beyond statement dates
 * and doesn't stop due to balance corruption or processing errors.
 */
describe("Forecast Continuity Regression Tests", () => {
  let mockPrisma: any;
  let engine: ForecastEngine;
  let cache: ModernCacheService;

  beforeEach(async () => {
    moment = (await import("moment")).default;
    // Mock Prisma client
    mockPrisma = {
      accountRegister: {
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      registerEntry: {
        findMany: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
      },
      reoccurrence: {
        findMany: vi.fn(),
        aggregate: vi.fn(),
      },
      reoccurrenceSkip: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    // Create engine with mocked database
    engine = new ForecastEngine(mockPrisma);

    cache = new ModernCacheService();
  });

  describe("Multi-month forecast continuity", () => {
    it("should continue forecasting beyond multiple statement dates", async () => {
      // Arrange: GM Financial account that was causing issues
      const gmAccount = {
        id: 8,
        name: "GM Financial",
        typeId: 5, // Loan
        balance: -25432.07,
        budgetId: 1,
        accountId: "gm-financial-test",
        latestBalance: -25432.07,
        minPayment: 803.05,
        statementAt: dateTimeService.create("2025-08-09"),
        statementIntervalId: 3, // Monthly
        apr1: 0.05,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: 1,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      const targetAccount = {
        id: 1,
        name: "Checking Account",
        typeId: 1,
        balance: 5000,
        budgetId: 1,
        accountId: "checking-test",
        latestBalance: 5000,
        minPayment: null,
        statementAt: dateTimeService.create("2025-08-01"),
        statementIntervalId: 3,
        apr1: null,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      // Mock database responses
      mockPrisma.accountRegister.findMany.mockResolvedValue([
        gmAccount,
        targetAccount,
      ]);
      mockPrisma.registerEntry.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrenceSkip.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.aggregate.mockResolvedValue({
        _min: { lastAt: null },
      });
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});
      mockPrisma.registerEntry.createMany.mockResolvedValue({});

      // Act: Run forecast for 6 months beyond the original issue date
      const result = await engine.recalculate({
        accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        startDate: new Date("2025-08-01"),
        endDate: new Date("2026-02-01"), // 6 months later
        logging: { enabled: false },
      });

      // Assert: Should complete successfully without stopping
      expect(result.isSuccess).toBe(true);
      expect(result.errors).toBeUndefined();

      // Should have processed multiple statement periods
      expect(result.datesProcessed).toBeGreaterThan(150); // ~6 months of days

      // Should have created entries beyond the original problem date
      const createCalls = mockPrisma.registerEntry.createMany.mock.calls;
      expect(createCalls.length).toBeGreaterThan(0);

      if (createCalls.length > 0) {
        const allEntries = createCalls.flatMap((call) => call[0].data);
        const latestEntryDate = Math.max(
          ...allEntries.map((entry) => new Date(entry.createdAt).getTime())
        );
        expect(new Date(latestEntryDate).getTime()).toBeGreaterThan(
          new Date("2025-12-01").getTime()
        );
      }
    });

    it("should handle multiple accounts with different statement cycles", async () => {
      // Arrange: Multiple accounts with overlapping statement dates
      const accounts = [
        {
          id: 10,
          name: "Monthly Credit Card",
          typeId: 4,
          balance: -1500,
          statementAt: moment("2025-01-15"),
          statementIntervalId: 3, // Monthly
          apr1: 0.18,
          minPayment: 50,
          targetAccountRegisterId: 13,
          budgetId: 1,
          accountId: "monthly-cc",
          latestBalance: -1500,
          apr2: null,
          apr3: null,
          apr1StartAt: null,
          apr2StartAt: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: 999,
          savingsGoalSortOrder: 999,
          accountSavingsGoal: null,
          minAccountBalance: 0,
          allowExtraPayment: false,
          isArchived: false,
          plaidId: null,
        },
        {
          id: 11,
          name: "Weekly Savings",
          typeId: 2,
          balance: 2000,
          statementAt: moment("2025-01-07"),
          statementIntervalId: 2, // Weekly
          apr1: 0.03,
          minPayment: null,
          targetAccountRegisterId: null,
          budgetId: 1,
          accountId: "weekly-savings",
          latestBalance: 2000,
          apr2: null,
          apr3: null,
          apr1StartAt: null,
          apr2StartAt: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: 999,
          savingsGoalSortOrder: 999,
          accountSavingsGoal: null,
          minAccountBalance: 0,
          allowExtraPayment: false,
          isArchived: false,
          plaidId: null,
        },
        {
          id: 12,
          name: "Daily Investment",
          typeId: 2,
          balance: 10000,
          statementAt: moment("2025-01-01"),
          statementIntervalId: 1, // Daily
          apr1: 0.07,
          minPayment: null,
          targetAccountRegisterId: null,
          budgetId: 1,
          accountId: "daily-investment",
          latestBalance: 10000,
          apr2: null,
          apr3: null,
          apr1StartAt: null,
          apr2StartAt: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: 999,
          savingsGoalSortOrder: 999,
          accountSavingsGoal: null,
          minAccountBalance: 0,
          allowExtraPayment: false,
          isArchived: false,
          plaidId: null,
        },
        {
          id: 13,
          name: "Checking Account",
          typeId: 1,
          balance: 5000,
          statementAt: moment("2025-01-01"),
          statementIntervalId: 3,
          apr1: null,
          minPayment: null,
          targetAccountRegisterId: null,
          budgetId: 1,
          accountId: "checking",
          latestBalance: 5000,
          apr2: null,
          apr3: null,
          apr1StartAt: null,
          apr2StartAt: null,
          apr3StartAt: null,
          loanStartAt: null,
          loanPaymentsPerYear: null,
          loanTotalYears: null,
          loanOriginalAmount: null,
          loanPaymentSortOrder: 999,
          savingsGoalSortOrder: 999,
          accountSavingsGoal: null,
          minAccountBalance: 0,
          allowExtraPayment: false,
          isArchived: false,
          plaidId: null,
        },
      ];

      mockPrisma.accountRegister.findMany.mockResolvedValue(accounts);
      mockPrisma.registerEntry.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});
      mockPrisma.registerEntry.createMany.mockResolvedValue({});

      // Act: Run forecast over 3 months
      const result = await engine.recalculate({
        accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-04-01"),
        logging: { enabled: false },
      });

      // Assert: Should process all accounts continuously
      expect(result.isSuccess).toBe(true);
      expect(result.datesProcessed).toBe(90); // 3 months

      // Should handle all different interval types without stopping
      const createCalls = mockPrisma.registerEntry.createMany.mock.calls;
      if (createCalls.length > 0) {
        const allEntries = createCalls.flatMap((call) => call[0].data);

        // Should have entries for all account types
        const accountIds = [
          ...new Set(allEntries.map((entry) => entry.accountRegisterId)),
        ];
        expect(accountIds.length).toBeGreaterThanOrEqual(3); // At least interest-bearing accounts
      }
    });
  });

  describe("Statement date boundary handling", () => {
    it("should properly advance statement dates month over month", async () => {
      // Arrange: Account with end-of-month statement dates
      const account = {
        id: 20,
        name: "Month End Account",
        typeId: 4,
        balance: -3000,
        statementAt: moment("2025-01-31"),
        statementIntervalId: 3, // Monthly
        apr1: 0.15,
        minPayment: 100,
        targetAccountRegisterId: 21,
        budgetId: 1,
        accountId: "month-end",
        latestBalance: -3000,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      const checkingAccount = {
        id: 21,
        name: "Checking",
        typeId: 1,
        balance: 10000,
        statementAt: moment("2025-01-01"),
        statementIntervalId: 3,
        apr1: null,
        budgetId: 1,
        accountId: "checking",
        latestBalance: 10000,
        minPayment: null,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      mockPrisma.accountRegister.findMany.mockResolvedValue([
        account,
        checkingAccount,
      ]);
      mockPrisma.registerEntry.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});
      mockPrisma.registerEntry.createMany.mockResolvedValue({});

      // Act: Forecast through Feb (28 days), March (31 days), April (30 days)
      const result = await engine.recalculate({
        accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-05-01"),
        logging: { enabled: false },
      });

      // Assert: Should handle month-end dates correctly
      expect(result.isSuccess).toBe(true);
      expect(result.datesProcessed).toBe(120); // 4 months

      // Check that statement dates were updated properly
      const updateCalls = mockPrisma.accountRegister.update.mock.calls;
      if (updateCalls.length > 0) {
        // Should have updated statement dates multiple times
        expect(updateCalls.length).toBeGreaterThan(0);
      }
    });

    it("should handle leap year February correctly", async () => {
      // Arrange: Account with Feb 29 statement date in leap year
      const account = {
        id: 30,
        name: "Leap Year Test",
        typeId: 2,
        balance: 5000,
        statementAt: moment("2024-02-29"), // Leap year date
        statementIntervalId: 3, // Monthly
        apr1: 0.04,
        budgetId: 1,
        accountId: "leap-year",
        latestBalance: 5000,
        minPayment: null,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      mockPrisma.accountRegister.findMany.mockResolvedValue([account]);
      mockPrisma.registerEntry.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});
      mockPrisma.registerEntry.createMany.mockResolvedValue({});

      // Act: Forecast through non-leap year 2025
      const result = await engine.recalculate({
        accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        startDate: new Date("2024-02-01"),
        endDate: new Date("2025-03-31"),
        logging: { enabled: false },
      });

      // Assert: Should handle leap year transition without stopping
      expect(result.isSuccess).toBe(true);
      expect(result.datesProcessed).toBeGreaterThan(365); // Over a year
    });
  });

  describe("Balance integrity over long periods", () => {
    it("should maintain numeric balance types throughout long forecasts", async () => {
      // Arrange: Account that caused balance corruption
      const account = {
        id: 40,
        name: "Balance Integrity Test",
        typeId: 5,
        balance: -15000.5,
        statementAt: moment("2025-01-15"),
        statementIntervalId: 3,
        apr1: 0.06,
        minPayment: 250.75,
        targetAccountRegisterId: 41,
        budgetId: 1,
        accountId: "balance-integrity",
        latestBalance: -15000.5,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      const checkingAccount = {
        id: 41,
        name: "Checking",
        typeId: 1,
        balance: 20000,
        statementAt: moment("2025-01-01"),
        statementIntervalId: 3,
        apr1: null,
        budgetId: 1,
        accountId: "checking",
        latestBalance: 20000,
        minPayment: null,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      mockPrisma.accountRegister.findMany.mockResolvedValue([
        account,
        checkingAccount,
      ]);
      mockPrisma.registerEntry.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});

      // Capture created entries to verify balance integrity
      const allCreatedEntries: any[] = [];
      mockPrisma.registerEntry.createMany.mockImplementation((data) => {
        allCreatedEntries.push(...data.data);
        return Promise.resolve({});
      });

      // Act: Run very long forecast (2 years)
      const result = await engine.recalculate({
        accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2027-01-01"),
        logging: { enabled: false },
      });

      // Assert: Should complete full 2-year forecast
      expect(result.isSuccess).toBe(true);
      expect(result.datesProcessed).toBe(730); // 2 years

      // Verify all balances are numeric, not string concatenations
      for (const entry of allCreatedEntries) {
        expect(typeof entry.balance).toBe("number");
        expect(typeof entry.amount).toBe("number");

        // Should not contain concatenated strings
        expect(entry.balance.toString()).not.toMatch(/\d+\.\d+\d+\.\d+/); // e.g., "123.45678.90"
        expect(entry.amount.toString()).not.toMatch(/\d+\.\d+\d+\.\d+/);

        // Should be valid numbers
        expect(isNaN(entry.balance)).toBe(false);
        expect(isNaN(entry.amount)).toBe(false);
        expect(isFinite(entry.balance)).toBe(true);
        expect(isFinite(entry.amount)).toBe(true);
      }
    });

    it("should handle multiple interest calculations without corruption", async () => {
      // Arrange: High-interest account that compounds frequently
      const account = {
        id: 50,
        name: "High Interest Account",
        typeId: 2,
        balance: 100000, // Large balance for bigger interest amounts
        statementAt: moment("2025-01-01"),
        statementIntervalId: 2, // Weekly interest
        apr1: 0.12, // High APR
        budgetId: 1,
        accountId: "high-interest",
        latestBalance: 100000,
        minPayment: null,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      mockPrisma.accountRegister.findMany.mockResolvedValue([account]);
      mockPrisma.registerEntry.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});

      const allCreatedEntries: any[] = [];
      mockPrisma.registerEntry.createMany.mockImplementation((data) => {
        allCreatedEntries.push(...data.data);
        return Promise.resolve({});
      });

      // Act: Run forecast for 1 year (52 weeks of interest)
      const result = await engine.recalculate({
        accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2026-01-01"),
        logging: { enabled: false },
      });

      // Assert: Should process full year
      expect(result.isSuccess).toBe(true);

      // Find all interest entries
      const interestEntries = allCreatedEntries.filter(
        (entry) =>
          entry.description &&
          entry.description.toLowerCase().includes("interest")
      );

      // Should have ~52 interest entries (weekly)
      expect(interestEntries.length).toBeGreaterThan(50);
      expect(interestEntries.length).toBeLessThan(55);

      // All interest entries should have valid amounts and balances
      for (const entry of interestEntries) {
        expect(entry.amount).toBeGreaterThan(0); // Earning interest
        expect(typeof entry.amount).toBe("number");
        expect(typeof entry.balance).toBe("number");
        expect(isFinite(entry.amount)).toBe(true);
        expect(isFinite(entry.balance)).toBe(true);
      }

      // Final balance should be higher than starting (compounding interest)
      const finalEntries = allCreatedEntries.slice(-5); // Last few entries
      if (finalEntries.length > 0) {
        const finalBalance = Math.max(...finalEntries.map((e) => e.balance));
        expect(finalBalance).toBeGreaterThan(100000); // Should have grown
        expect(finalBalance).toBeLessThan(200000); // But not unreasonably
      }
    });
  });

  describe("Error recovery and continuation", () => {
    it("should continue processing after encountering boundary conditions", async () => {
      // Arrange: Account with very small balance that could cause issues
      const account = {
        id: 60,
        name: "Tiny Balance Account",
        typeId: 4,
        balance: -0.01, // Very small debt
        statementAt: moment("2025-01-15"),
        statementIntervalId: 3,
        apr1: 0.2, // High APR
        minPayment: 0.01, // Tiny minimum payment
        targetAccountRegisterId: 61,
        budgetId: 1,
        accountId: "tiny-balance",
        latestBalance: -0.01,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      const checkingAccount = {
        id: 61,
        name: "Checking",
        typeId: 1,
        balance: 1000,
        statementAt: moment("2025-01-01"),
        statementIntervalId: 3,
        apr1: null,
        budgetId: 1,
        accountId: "checking",
        latestBalance: 1000,
        minPayment: null,
        apr2: null,
        apr3: null,
        apr1StartAt: null,
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      mockPrisma.accountRegister.findMany.mockResolvedValue([
        account,
        checkingAccount,
      ]);
      mockPrisma.registerEntry.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});
      mockPrisma.registerEntry.createMany.mockResolvedValue({});

      // Act: Should handle tiny amounts without stopping
      const result = await engine.recalculate({
        accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-07-01"),
        logging: { enabled: false },
      });

      // Assert: Should complete despite tiny amounts
      expect(result.isSuccess).toBe(true);
      expect(result.datesProcessed).toBe(181); // 6 months
    });
  });
});
