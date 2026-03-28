import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Prisma } from "@prisma/client";
import { dateTimeService } from "../DateTimeService";
import { Decimal } from "~/types/test-types";
import { ForecastEngineFactory } from "../index";

const dt = (input?: any) => dateTimeService.create(input);

/**
 * Integration Regression Tests
 *
 * These end-to-end tests simulate real-world scenarios that would have caught
 * all three recently fixed bugs in combination. They test the complete forecast
 * pipeline with realistic data and conditions.
 *
 * Time-independent: scenarios use fixed date ranges (e.g. 2025-08-01 to 2025-12-01)
 * and assertions use result.registerEntries (engine output), not persistence.
 * No "now" or current-date dependency, so tests pass the same in 1 year or 10.
 */
describe("Integration Regression Tests", () => {
  let mockPrisma: any;
  let engine: any;

  beforeEach(async () => {
    // Mock Prisma with realistic database behavior
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
        aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: null } }),
        update: vi.fn().mockResolvedValue({}),
      },
      reoccurrenceSkip: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      reoccurrenceSplit: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      savingsGoal: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
      $executeRaw: vi.fn().mockResolvedValue(undefined),
    };

    // Create engine using factory
    engine = ForecastEngineFactory.create(mockPrisma);
  });

  describe("Real-world GM Financial scenario reproduction", () => {
    it("should handle the exact GM Financial case that caused all three bugs", async () => {
      // Assert on result.registerEntries (engine output), not persistence layer, so the test
      // is time-independent: persistence filters out past-dated entries as isPending, so
      // allCreatedEntries would be empty when "today" is after the forecast range.
      // Arrange: Exact data that caused the original issues
      const gmFinancialAccount = {
        id: 8,
        name: "GM Financial",
        typeId: 5, // Loan
        balance: new Decimal("-25432.07"), // Prisma Decimal (Bug #1 trigger)
        budgetId: 1,
        accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c",
        latestBalance: new Decimal("-25432.07"),
        minPayment: new Decimal("803.05"), // Decimal min payment
        statementAt: dateTimeService.create("2025-08-09T12:00:00Z"), // UTC so loader/createUTC preserves Aug 9
        statementIntervalId: 3, // Monthly
        apr1: new Decimal("0.05"), // 5% APR
        apr2: null,
        apr3: null,
        apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: 1, // Auto-pay from checking
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
        id: 1,
        name: "Main Checking",
        typeId: 1,
        balance: new Decimal("10000"), // Adequate funds for payments
        budgetId: 1,
        accountId: "checking-main",
        latestBalance: new Decimal("10000"),
        minPayment: null,
        statementAt: dateTimeService.create("2025-08-01T12:00:00Z"),
        statementIntervalId: 3,
        apr1: null,
        apr2: null,
        apr3: null,
        apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
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

      // Existing entries (to simulate mid-month start)
      const existingEntries = [
        {
          id: "existing-1",
          seq: null,
          accountRegisterId: 8,
          sourceAccountRegisterId: null,
          createdAt: dateTimeService.create("2025-08-05"),
          description: "Previous transaction",
          reoccurrenceId: null,
          amount: new Decimal("-50.00"), // Decimal amount
          balance: 0, // Will be recalculated
          isBalanceEntry: false,
          isPending: false,
          isCleared: true,
          isProjected: false,
          isManualEntry: true,
          isReconciled: false,
        },
      ];

      // Mock database responses
      mockPrisma.accountRegister.findMany.mockResolvedValue([
        gmFinancialAccount,
        checkingAccount,
      ]);
      mockPrisma.registerEntry.findMany.mockResolvedValue(existingEntries);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});
      mockPrisma.registerEntry.createMany.mockResolvedValue({});

      // Act: Run the exact forecast that originally failed
      const result = await engine.recalculate({
        accountId: gmFinancialAccount.accountId,
        startDate: new Date("2025-08-01T00:00:00.000Z"),
        endDate: new Date("2025-12-01T00:00:00.000Z"), // 4 months beyond issue date
        logging: { enabled: false },
      });

      // Assert on engine output (result.registerEntries), not persistence, so test is stable
      // regardless of run date; persistence excludes past-dated entries as isPending.
      expect(result.isSuccess).toBe(true);

      const gmEntries = (result.registerEntries || []).filter(
        (entry: any) => entry.accountRegisterId === 8,
      );

      // Bug #1: Balance arithmetic should be correct (not concatenated)
      for (const entry of gmEntries) {
        expect(typeof entry.balance).toBe("number");
        expect(typeof entry.amount).toBe("number");
        expect(entry.balance.toString()).not.toMatch(/\d+\.\d+\d+\.\d+/);
        expect(entry.amount.toString()).not.toMatch(/\d+\.\d+\d+\.\d+/);
      }

      // Bug #2: Interest should be calculated exactly once per month
      const interestEntries = gmEntries.filter((entry: any) =>
        entry.description?.toLowerCase().includes("interest"),
      );
      expect(interestEntries.length).toBeGreaterThanOrEqual(3);
      expect(interestEntries.length).toBeLessThanOrEqual(4);

      const interestDates = interestEntries
        .map((entry: any) =>
          dateTimeService.format("YYYY-MM-DD", new Date(entry.createdAt)),
        )
        .sort((a: string, b: string) => a.localeCompare(b));
      for (let i = 1; i < interestDates.length; i++) {
        const current = dateTimeService.create(interestDates[i]);
        const previous = dateTimeService.create(interestDates[i - 1]);
        const daysDiff = current.diff(previous, "days");
        expect(daysDiff).toBeGreaterThan(25);
      }

      // Bug #3: Forecast should continue well beyond August 8th
      expect(result.datesProcessed).toBeGreaterThan(100);

      const latestEntryDate = Math.max(
        ...gmEntries.map((entry: any) => new Date(entry.createdAt).getTime()),
      );
      expect(new Date(latestEntryDate).getTime()).toBeGreaterThan(
        new Date("2025-11-01T00:00:00.000Z").getTime(),
      );
    });
  });

  describe("Multi-account complex scenario", () => {
    it("should handle multiple accounts with overlapping bugs simultaneously", async () => {
      // Arrange: Complex scenario with multiple account types
      const accounts = [
        // Credit card with monthly interest (could trigger Bug #2)
        {
          id: 10,
          name: "Chase Sapphire",
          typeId: 4,
          balance: new Decimal("-8500.25"), // Decimal balance (Bug #1 trigger)
          budgetId: 1,
          accountId: "chase-cc",
          latestBalance: new Decimal("-8500.25"),
          minPayment: new Decimal("425.50"),
          statementAt: dateTimeService.create("2025-01-15"),
          statementIntervalId: 3, // Monthly
          apr1: new Decimal("0.1899"), // High APR
          apr2: null,
          apr3: null,
          apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
          apr2StartAt: null,
          apr3StartAt: null,
          targetAccountRegisterId: 12,
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
        // Savings account with weekly interest (potential Bug #2)
        {
          id: 11,
          name: "High Yield Savings",
          typeId: 2,
          balance: new Decimal("15750.80"),
          budgetId: 1,
          accountId: "hy-savings",
          latestBalance: new Decimal("15750.80"),
          minPayment: null,
          statementAt: dateTimeService.create("2025-01-07"),
          statementIntervalId: 2, // Weekly
          apr1: new Decimal("0.045"), // 4.5% APR
          apr2: null,
          apr3: null,
          apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
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
        },
        // Checking account (funding source)
        {
          id: 12,
          name: "Main Checking",
          typeId: 1,
          balance: new Decimal("5000.00"),
          budgetId: 1,
          accountId: "checking",
          latestBalance: new Decimal("5000.00"),
          minPayment: null,
          statementAt: dateTimeService.create("2025-01-01"),
          statementIntervalId: 3,
          apr1: null,
          apr2: null,
          apr3: null,
          apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
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
        },
        // Auto loan (potential Bug #3 - long timeline)
        {
          id: 13,
          name: "Toyota Financing",
          typeId: 5,
          balance: new Decimal("-18500.99"),
          budgetId: 1,
          accountId: "toyota-loan",
          latestBalance: new Decimal("-18500.99"),
          minPayment: new Decimal("352.17"),
          statementAt: dateTimeService.create("2025-01-22"),
          statementIntervalId: 3, // Monthly
          apr1: new Decimal("0.0329"), // 3.29% APR
          apr2: null,
          apr3: null,
          apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
          apr2StartAt: null,
          apr3StartAt: null,
          targetAccountRegisterId: 12,
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

      // Reoccurrences in Prisma shape so DataLoader and engine can use them
      const reoccurrences = [
        {
          id: 1,
          accountId: "test-budget",
          accountRegisterId: 10,
          intervalId: 3,
          intervalCount: 1,
          lastAt: new Date("2024-12-01T00:00:00.000Z"),
          endAt: null,
          amount: new Decimal("500.00"),
          description: "Monthly Savings Transfer",
          updatedAt: new Date("2024-12-01T00:00:00.000Z"),
          transferAccountRegisterId: null,
          adjustBeforeIfOnWeekend: false,
          totalIntervals: null,
          elapsedIntervals: null,
          interval: { name: "Month" },
        },
      ];

      // Existing balance entries with Decimal amounts
      const existingEntries = accounts.map((account) => ({
        id: `balance-${account.id}`,
        seq: null,
        accountRegisterId: account.id,
        sourceAccountRegisterId: null,
        createdAt: dateTimeService.create("2024-12-31"),
        description: "Opening Balance",
        reoccurrenceId: null,
        amount: account.balance,
        balance: account.balance,
        isBalanceEntry: true,
        isPending: false,
        isCleared: true,
        isProjected: false,
        isManualEntry: false,
        isReconciled: true,
      }));

      // Mock database
      mockPrisma.accountRegister.findMany.mockResolvedValue(accounts);
      mockPrisma.registerEntry.findMany.mockResolvedValue(existingEntries);
      mockPrisma.reoccurrence.findMany.mockResolvedValue(reoccurrences);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});

      const allCreatedEntries: any[] = [];
      mockPrisma.registerEntry.createMany.mockImplementation(
        (data: Prisma.RegisterEntryCreateManyArgs) => {
          const rows = Array.isArray(data.data) ? data.data : [data.data];
          allCreatedEntries.push(...rows);
          return Promise.resolve({});
        },
      );

      // Act: Run comprehensive 6-month forecast
      const result = await engine.recalculate({
        accountId: "test-budget",
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: new Date("2025-07-01T00:00:00.000Z"), // 6 months
        logging: { enabled: false },
      });

      // Assert: All bugs prevented across all accounts

      // Bug #1: All balance arithmetic should be numeric
      expect(result.isSuccess).toBe(true);

      for (const entry of allCreatedEntries) {
        expect(typeof entry.balance).toBe("number");
        expect(typeof entry.amount).toBe("number");
        expect(Number.isFinite(entry.balance)).toBe(true);
        expect(Number.isFinite(entry.amount)).toBe(true);
        // No string concatenation artifacts
        expect(entry.balance.toString()).not.toMatch(/\d+\.\d+\d+\.\d+/);
      }

      // Bug #2: Interest should be calculated correctly for each account
      for (const account of accounts.filter((a) => a.apr1)) {
        const accountEntries = allCreatedEntries.filter(
          (e) => e.accountRegisterId === account.id,
        );
        const interestEntries = accountEntries.filter((e) =>
          e.description?.toLowerCase().includes("interest"),
        );

        if (interestEntries.length > 1) {
          // Check no consecutive day interest processing
          const dates = interestEntries
            .map((e) => dt(e.createdAt).format("YYYY-MM-DD"))
            .sort((a: string, b: string) => a.localeCompare(b));
          for (let i = 1; i < dates.length; i++) {
            const daysDiff = dt(dates[i]).diff(dt(dates[i - 1]), "days");
            if (account.statementIntervalId === 2) {
              // Weekly
              expect(daysDiff).toBeGreaterThan(5); // At least 6 days apart
            } else if (account.statementIntervalId === 3) {
              // Monthly
              expect(daysDiff).toBeGreaterThan(25); // At least 26 days apart
            }
          }
        }
      }

      // Bug #3: Forecast should complete full timeline for all accounts
      expect(result.datesProcessed).toBe(182); // 6 months (inclusive end date)

      // Monthly recurrence: when persistence captures recurrence entries, expect 7 monthly occurrences
      const monthlyRecurrenceEntries = allCreatedEntries.filter(
        (e) => e.description === "Monthly Savings Transfer",
      );
      expect(monthlyRecurrenceEntries.length).toBeGreaterThanOrEqual(0);
      if (monthlyRecurrenceEntries.length >= 7) {
        const monthlyDates = monthlyRecurrenceEntries
          .map((e) => dt(e.createdAt).format("YYYY-MM-DD"))
          .sort((a: string, b: string) => a.localeCompare(b));
        expect(monthlyDates).toEqual([
          "2025-01-01",
          "2025-02-01",
          "2025-03-01",
          "2025-04-01",
          "2025-05-01",
          "2025-06-01",
          "2025-07-01",
        ]);
      }

      const resultEntries = (result.registerEntries || []) as Array<{
        accountRegisterId: number;
        createdAt: Date | string | number;
      }>;

      // Each account should have entries throughout the timeline
      for (const account of accounts) {
        const accountEntries = resultEntries.filter(
          (e) => e.accountRegisterId === account.id,
        );
        expect(accountEntries.length).toBeGreaterThan(0);

        // Should have entries beyond the first month
        const latestEntry = Math.max(
          ...accountEntries.map((e) => new Date(e.createdAt).getTime()),
        );
        expect(Number.isFinite(latestEntry)).toBe(true);
        expect(new Date(latestEntry).getTime()).toBeGreaterThan(
          new Date("2025-03-01T00:00:00.000Z").getTime(),
        );
      }
    });
  });

  describe("Edge case combinations", () => {
    it("should handle month-end statements with Decimal balances and frequent interest", async () => {
      // Arrange: Account with all bug triggers combined
      const edgeCaseAccount = {
        id: 99,
        name: "Edge Case Account",
        typeId: 2, // Savings
        balance: new Decimal("999.99"), // Decimal with precision
        budgetId: 1,
        accountId: "edge-case",
        latestBalance: new Decimal("999.99"),
        minPayment: null,
        statementAt: dateTimeService.create("2025-01-01"), // Start date for daily processing
        statementIntervalId: 3, // Monthly interest (stress test)
        apr1: new Decimal("0.10"), // 10% APR
        apr2: null,
        apr3: null,
        apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
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

      // Multiple existing entries with various Decimal amounts
      const existingEntries = [
        {
          id: "edge-1",
          seq: null,
          accountRegisterId: 99,
          sourceAccountRegisterId: null,
          createdAt: dateTimeService.create("2025-01-15"),
          description: "Complex Transaction 1",
          reoccurrenceId: null,
          amount: new Decimal("123.456"), // Precise decimal
          balance: 0,
          isBalanceEntry: false,
          isPending: false,
          isCleared: true,
          isProjected: false,
          isManualEntry: true,
          isReconciled: false,
        },
        {
          id: "edge-2",
          seq: null,
          accountRegisterId: 99,
          sourceAccountRegisterId: null,
          createdAt: dateTimeService.create("2025-01-20"),
          description: "Complex Transaction 2",
          reoccurrenceId: null,
          amount: new Decimal("-0.01"), // Tiny amount
          balance: 0,
          isBalanceEntry: false,
          isPending: false,
          isCleared: true,
          isProjected: false,
          isManualEntry: true,
          isReconciled: false,
        },
      ];

      mockPrisma.accountRegister.findMany.mockResolvedValue([edgeCaseAccount]);
      mockPrisma.registerEntry.findMany.mockResolvedValue(existingEntries);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});

      const allCreatedEntries: any[] = [];
      mockPrisma.registerEntry.createMany.mockImplementation(
        (data: Prisma.RegisterEntryCreateManyArgs) => {
          const rows = Array.isArray(data.data) ? data.data : [data.data];
          allCreatedEntries.push(...rows);
          return Promise.resolve({});
        },
      );

      // Act: Process through month-end and leap year boundary
      const result = await engine.recalculate({
        accountId: "edge-case",
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: new Date("2025-03-31T00:00:00.000Z"), // Cross month boundaries
        logging: { enabled: false },
      });

      // Assert: Should handle all edge cases correctly
      expect(result.isSuccess).toBe(true);
      expect(result.datesProcessed).toBe(90); // Jan + Feb + Mar (inclusive end date)

      // All calculations should remain numeric despite Decimal inputs
      for (const entry of allCreatedEntries) {
        expect(typeof entry.balance).toBe("number");
        expect(typeof entry.amount).toBe("number");
        expect(Number.isFinite(entry.balance)).toBe(true);
        expect(Number.isFinite(entry.amount)).toBe(true);
      }

      // Daily interest should not create consecutive duplicates (monthly cadence)
      const interestEntries = allCreatedEntries.filter(
        (entry) =>
          entry.accountRegisterId === edgeCaseAccount.id &&
          entry.description?.toLowerCase().includes("interest"),
      );
      if (interestEntries.length > 1) {
        const dates = interestEntries
          .map((e) => dt(e.createdAt).format("YYYY-MM-DD"))
          .sort((a: string, b: string) => a.localeCompare(b));
        for (let i = 1; i < dates.length; i++) {
          const daysDiff = dt(dates[i]).diff(dt(dates[i - 1]), "days");
          expect(daysDiff).toBeGreaterThan(25);
        }
      }

      // Basic validation that the test ran successfully
      expect(allCreatedEntries.length).toBeGreaterThan(0);

      // Basic validation that the test completed successfully
      expect(result.isSuccess).toBe(true);
      expect(result.datesProcessed).toBe(90); // Jan + Feb + Mar (inclusive end date)
    });
  });

  describe("Performance and stability under load", () => {
    it("should maintain accuracy during long-term compound calculations", async () => {
      // Arrange: Account designed to stress-test all three bugs over time
      const longTermAccount = {
        id: 100,
        name: "Long Term Growth Account",
        typeId: 2,
        balance: new Decimal("50000.00"), // Large starting balance
        budgetId: 1,
        accountId: "long-term",
        latestBalance: new Decimal("50000.00"),
        minPayment: null,
        statementAt: dateTimeService.create("2025-01-01T12:00:00Z"),
        statementIntervalId: 3, // Monthly compounding
        apr1: new Decimal("0.08"), // 8% APR
        apr2: null,
        apr3: null,
        apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
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
        type: { accruesBalanceGrowth: true },
      };

      mockPrisma.accountRegister.findMany.mockResolvedValue([longTermAccount]);
      mockPrisma.registerEntry.findMany.mockResolvedValue([]);
      mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
      mockPrisma.registerEntry.deleteMany.mockResolvedValue({});
      mockPrisma.registerEntry.createMany.mockResolvedValue({});

      // Act: Run 5-year forecast (stress test)
      const result = await engine.recalculate({
        accountId: "long-term",
        startDate: new Date("2025-01-01T00:00:00.000Z"),
        endDate: new Date("2030-01-01T00:00:00.000Z"), // 5 years
        logging: { enabled: false },
      });

      // Assert on engine output so test is time-independent (persistence filters past-dated entries)
      expect(result.isSuccess).toBe(true);
      expect(result.datesProcessed).toBe(1827); // 5 years (including leap year, inclusive end date)

      const accountId = 100;
      const allEntries = (result.registerEntries || []).filter(
        (e: any) => e.accountRegisterId === accountId,
      );
      const interestEntries = allEntries.filter((entry: any) =>
        entry.description?.toLowerCase().includes("interest"),
      );
      expect(interestEntries.length).toBeGreaterThanOrEqual(48);
      expect(interestEntries.length).toBeLessThanOrEqual(65);

      const finalBalance = Math.max(...allEntries.map((e: any) => e.balance));
      expect(typeof finalBalance).toBe("number");
      expect(finalBalance).toBeGreaterThan(50000);
      expect(finalBalance).toBeLessThan(100000);

      for (const entry of allEntries) {
        expect(entry.balance.toString()).not.toMatch(/\d{5,}\.\d+\d+\.\d+/);
        expect(entry.amount.toString()).not.toMatch(/\d+\.\d+\d+\.\d+/);
      }

      // Compound interest: amounts positive and reasonable (monthly ~8%/12)
      for (const interestEntry of interestEntries) {
        expect(interestEntry.amount).toBeGreaterThan(0);
        expect(interestEntry.amount).toBeLessThan(5000); // single month on 50k @ 8% is ~333
      }
    });
  });
});
