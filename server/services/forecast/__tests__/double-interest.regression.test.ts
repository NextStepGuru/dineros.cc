import { vi, describe, it, expect, beforeEach } from "vitest";
import { LoanCalculatorService } from "../LoanCalculatorService";
import { AccountRegisterService } from "../AccountRegisterService";
import { ForecastEngine } from "../ForecastEngine";
import { ModernCacheService } from "../ModernCacheService";
import { RegisterEntryService } from "../RegisterEntryService";
import { ReoccurrenceService } from "../ReoccurrenceService";
import { TransferService } from "../TransferService";
import { dateTimeService } from "../DateTimeService";
import type { CacheAccountRegister } from "../ModernCacheService";

// Dynamic moment import
let moment: any;

/**
 * Regression tests for Bug #2: Double Interest Calculation
 *
 * These tests verify that interest is calculated exactly once per statement period,
 * not on consecutive days due to grace period logic.
 */
describe("Double Interest Calculation Regression Tests", () => {
  let cache: ModernCacheService;
  let loanCalculator: LoanCalculatorService;
  let accountService: AccountRegisterService;
  let entryService: RegisterEntryService;
  let transferService: TransferService;
  let mockDb: any;

  beforeEach(async () => {
    moment = (await import("moment")).default;
    // Reset cache
    cache = new ModernCacheService();

    // Mock database
    mockDb = {
      accountRegister: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    // Create real services (not mocked)
    loanCalculator = new LoanCalculatorService();
    entryService = new RegisterEntryService(mockDb, cache);
    transferService = new TransferService(cache, entryService);
    accountService = new AccountRegisterService(
      mockDb,
      cache,
      loanCalculator,
      entryService,
      transferService
    );
  });

  describe("LoanCalculatorService.shouldProcessInterest()", () => {
    it("should return true only on exact statement date", () => {
      // Arrange: Account with statement date of Jan 15
      const account = {
        id: 1,
        balance: -1000,
        apr1: 0.12,
        apr2: null,
        apr3: null,
        statementAt: dateTimeService.create("2025-01-15"),
        statementIntervalId: 3,
        typeId: 4,
        name: "Test Credit Card",
        budgetId: 1,
        accountId: "test",
        latestBalance: -1000,
        minPayment: null,
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

      // Act & Assert: Test exact statement date
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          dateTimeService.create("2025-01-15")
        )
      ).toBe(true);

      // Should NOT process on the day before
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          dateTimeService.create("2025-01-14")
        )
      ).toBe(false);

      // Should NOT process on the day after (this was the bug!)
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          dateTimeService.create("2025-01-16")
        )
      ).toBe(false);

      // Should NOT process within old "grace period"
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          dateTimeService.create("2025-01-17")
        )
      ).toBe(false);
      expect(
        loanCalculator.shouldProcessInterest(account, moment("2025-01-18"))
      ).toBe(false);
      expect(
        loanCalculator.shouldProcessInterest(account, moment("2025-01-20"))
      ).toBe(false);
      expect(
        loanCalculator.shouldProcessInterest(account, moment("2025-01-22"))
      ).toBe(false); // 7 days later
    });

    it("should not process interest if no APR", () => {
      const account = {
        id: 2,
        balance: -1000,
        apr1: 0, // No APR
        apr2: null,
        apr3: null,
        statementAt: moment("2025-01-15"),
        statementIntervalId: 3,
        typeId: 4,
        name: "No APR Account",
        budgetId: 1,
        accountId: "test",
        latestBalance: -1000,
        minPayment: null,
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

      expect(
        loanCalculator.shouldProcessInterest(account, moment("2025-01-15"))
      ).toBe(false);
    });

    it("should not process interest if zero balance", () => {
      const account = {
        id: 3,
        balance: 0, // Zero balance
        apr1: 0.12,
        apr2: null,
        apr3: null,
        statementAt: moment("2025-01-15"),
        statementIntervalId: 3,
        typeId: 4,
        name: "Zero Balance Account",
        budgetId: 1,
        accountId: "test",
        latestBalance: 0,
        minPayment: null,
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

      expect(
        loanCalculator.shouldProcessInterest(account, moment("2025-01-15"))
      ).toBe(false);
    });
  });

  describe("AccountRegisterService statement date updates", () => {
    it("should advance statement date after processing interest", async () => {
      // Arrange: Account with monthly statements
      const account = {
        id: 5,
        balance: -2000,
        latestBalance: -2000,
        apr1: 0.18,
        apr2: null,
        apr3: null,
        statementAt: moment("2025-01-15"),
        statementIntervalId: 3, // Monthly
        typeId: 4,
        name: "Statement Date Test",
        budgetId: 1,
        accountId: "test",
        minPayment: 100,
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

      cache.accountRegister.insert(account);

      // Act: Update statement date as if interest was processed
      console.log(`[TEST] About to call updateStatementDates`);
      console.log(
        `[TEST] Account statement date: ${account.statementAt.format(
          "YYYY-MM-DD"
        )}`
      );
      console.log(
        `[TEST] Forecast date: ${moment("2025-01-15").format("YYYY-MM-DD")}`
      );
      await accountService.updateStatementDates(
        [account],
        moment("2025-01-15")
      );
      console.log(`[TEST] Finished calling updateStatementDates`);

      // Assert: Statement date should advance to next month
      expect((global as any).updateStatementDatesCalled).toBe(true);
      expect((global as any).updateStatementDatesCallCount).toBe(1);
      const updatedAccount = cache.accountRegister.findOne({ id: 5 });
      console.log(
        `[TEST] Updated account statement date: ${updatedAccount?.statementAt.format(
          "YYYY-MM-DD"
        )}`
      );
      console.log(
        `[TEST] Original account statement date: ${account.statementAt.format(
          "YYYY-MM-DD"
        )}`
      );
      console.log(
        `[TEST] Forecast date: ${moment("2025-01-15").format("YYYY-MM-DD")}`
      );
      expect(updatedAccount?.statementAt.format("YYYY-MM-DD")).toBe(
        "2025-02-15"
      );
    });

    it("should calculate next statement date correctly for different intervals", async () => {
      const testCases = [
        { intervalId: 1, current: "2025-01-15", expected: "2025-01-16" }, // Daily
        { intervalId: 2, current: "2025-01-15", expected: "2025-01-22" }, // Weekly
        { intervalId: 3, current: "2025-01-15", expected: "2025-02-15" }, // Monthly
        { intervalId: 4, current: "2025-01-15", expected: "2026-01-15" }, // Yearly
        { intervalId: 5, current: "2025-01-15", expected: "2026-01-15" }, // Once (defaults to yearly)
      ];

      for (const testCase of testCases) {
        // Arrange
        const account = {
          id: testCase.intervalId + 10,
          balance: -1000,
          latestBalance: -1000,
          statementAt: moment(testCase.current),
          statementIntervalId: testCase.intervalId,
          typeId: 4,
          name: `Interval Test ${testCase.intervalId}`,
          budgetId: 1,
          accountId: "test",
          apr1: 0.12,
          apr2: null,
          apr3: null,
          minPayment: null,
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

        cache.accountRegister.insert(account);

        // Act
        await accountService.updateStatementDates(
          [account],
          moment(testCase.current)
        );

        // Assert
        const updatedAccount = cache.accountRegister.findOne({
          id: testCase.intervalId + 10,
        });
        expect(updatedAccount?.statementAt.format("YYYY-MM-DD")).toBe(
          testCase.expected
        );
      }
    });
  });

  describe("Interest processing timeline simulation", () => {
    it("should process interest exactly once per month over multiple months", () => {
      // Arrange: Savings account that earns interest monthly
      const account = {
        id: 100,
        balance: 10000,
        latestBalance: 10000,
        apr1: 0.05, // 5% APR
        apr2: null,
        apr3: null,
        statementAt: moment("2025-01-15"),
        statementIntervalId: 3, // Monthly
        typeId: 2, // Savings account
        name: "Interest Timeline Test",
        budgetId: 1,
        accountId: "test",
        minPayment: null,
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

      cache.accountRegister.insert(account);

      // Act: Simulate 3 months of daily processing
      const interestDates: string[] = [];
      let currentDate = moment("2025-01-01");
      const endDate = moment("2025-04-01");

      while (currentDate.isBefore(endDate)) {
        const shouldProcess = loanCalculator.shouldProcessInterest(
          account,
          currentDate.clone()
        );

        if (shouldProcess) {
          interestDates.push(currentDate.format("YYYY-MM-DD"));

          // Simulate statement date update after processing
          if (currentDate.isSameOrAfter(account.statementAt)) {
            account.statementAt = account.statementAt.clone().add(1, "month");
          }
        }

        currentDate.add(1, "day");
      }

      // Assert: Should process exactly once per month
      expect(interestDates).toEqual([
        "2025-01-15", // First statement date
        "2025-02-15", // Second month
        "2025-03-15", // Third month
      ]);

      // Should NOT have consecutive days
      for (let i = 1; i < interestDates.length; i++) {
        const current = moment(interestDates[i]);
        const previous = moment(interestDates[i - 1]);
        const daysDiff = current.diff(previous, "days");

        expect(daysDiff).toBeGreaterThan(25); // Should be about 30 days apart
        expect(daysDiff).toBeLessThan(35);
      }
    });

    it("should prevent the exact double interest scenario from the bug", () => {
      // Arrange: Recreate the exact scenario from the screenshot
      const account = {
        id: 200,
        balance: 20000, // Slides & Solar savings fund from screenshot
        latestBalance: 20000,
        apr1: 0.05,
        apr2: null,
        apr3: null,
        statementAt: moment("2027-05-21"), // From screenshot
        statementIntervalId: 3, // Monthly
        typeId: 2, // Savings account
        name: "Slides & Solar savings fund",
        budgetId: 1,
        accountId: "test",
        minPayment: null,
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

      cache.accountRegister.insert(account);

      // Act: Test consecutive days around statement date
      const may21Should = loanCalculator.shouldProcessInterest(
        account,
        moment("2027-05-21")
      );
      const may22Should = loanCalculator.shouldProcessInterest(
        account,
        moment("2027-05-22")
      );
      const may23Should = loanCalculator.shouldProcessInterest(
        account,
        moment("2027-05-23")
      );

      // Assert: Only statement date should process
      expect(may21Should).toBe(true); // ✓ Statement date
      expect(may22Should).toBe(false); // ❌ Day after (this was the bug!)
      expect(may23Should).toBe(false); // ❌ Two days after
    });
  });

  describe("Integration test: Full interest processing cycle", () => {
    it("should process interest once per statement period in a full forecast", async () => {
      // Arrange: Account with interest
      const account = {
        id: 300,
        balance: 5000,
        latestBalance: 5000,
        apr1: 0.04, // 4% APR
        apr2: null,
        apr3: null,
        statementAt: moment("2025-02-01"),
        statementIntervalId: 3, // Monthly
        typeId: 2, // Savings account
        name: "Integration Test Account",
        budgetId: 1,
        accountId: "test-integration",
        minPayment: null,
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

      cache.accountRegister.insert(account);

      // Act: Process interest for multiple statement periods
      const interestEntries: Array<{ date: string; amount: number }> = [];

      // Simulate 4 months
      for (let month = 0; month < 4; month++) {
        const statementDate = moment("2025-02-01").add(month, "months");

        // Check if should process interest
        const shouldProcess = loanCalculator.shouldProcessInterest(
          account,
          statementDate
        );

        if (shouldProcess) {
          // Calculate and record interest
          const interest = await loanCalculator.calculateInterestForAccount(
            account
          );
          interestEntries.push({
            date: statementDate.format("YYYY-MM-DD"),
            amount: interest,
          });

          // Update statement date (simulate what happens in real processing)
          account.statementAt = statementDate.clone().add(1, "month");
          account.balance += interest; // Add earned interest to balance
        }
      }

      // Assert: Should have exactly 4 interest entries, one per month
      expect(interestEntries).toHaveLength(4);

      const expectedDates = [
        "2025-02-01",
        "2025-03-01",
        "2025-04-01",
        "2025-05-01",
      ];

      interestEntries.forEach((entry, index) => {
        expect(entry.date).toBe(expectedDates[index]);
        expect(entry.amount).toBeGreaterThan(0); // Should earn interest
      });
    });
  });

  describe("Edge cases that could trigger double processing", () => {
    it("should handle daylight saving time transitions correctly", () => {
      // DST typically happens in March/November
      const account = {
        id: 400,
        balance: 1000,
        apr1: 0.05,
        apr2: null,
        apr3: null,
        statementAt: moment("2025-03-09 12:00:00"), // DST transition weekend
        statementIntervalId: 3,
        typeId: 2,
        name: "DST Test Account",
        budgetId: 1,
        accountId: "test",
        latestBalance: 1000,
        minPayment: null,
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

      // Test various times on DST transition day
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          moment("2025-03-09 00:00:00")
        )
      ).toBe(true);
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          moment("2025-03-09 12:00:00")
        )
      ).toBe(true);
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          moment("2025-03-09 23:59:59")
        )
      ).toBe(true);

      // Should not process day before or after
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          moment("2025-03-08 23:59:59")
        )
      ).toBe(false);
      expect(
        loanCalculator.shouldProcessInterest(
          account,
          moment("2025-03-10 00:00:01")
        )
      ).toBe(false);
    });

    it("should handle month-end/month-start boundaries correctly", () => {
      const account = {
        id: 500,
        balance: 1000,
        apr1: 0.05,
        apr2: null,
        apr3: null,
        statementAt: moment("2025-01-31"), // End of month
        statementIntervalId: 3,
        typeId: 2,
        name: "Month End Test",
        budgetId: 1,
        accountId: "test",
        latestBalance: 1000,
        minPayment: null,
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

      // Should process only on exact date
      expect(
        loanCalculator.shouldProcessInterest(account, moment("2025-01-31"))
      ).toBe(true);
      expect(
        loanCalculator.shouldProcessInterest(account, moment("2025-01-30"))
      ).toBe(false);
      expect(
        loanCalculator.shouldProcessInterest(account, moment("2025-02-01"))
      ).toBe(false);
    });
  });
});
