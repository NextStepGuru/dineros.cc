import { Decimal } from "@prisma/client/runtime/library";
import { ModernCacheService } from "../ModernCacheService";
import { AccountRegisterService } from "../AccountRegisterService";
import { RegisterEntryService } from "../RegisterEntryService";
import { TransferService } from "../TransferService";
import moment from "moment";
import { vi } from "vitest";

/**
 * Regression tests for Bug #1: Balance Arithmetic Corruption
 *
 * These tests verify that balance calculations use numeric arithmetic
 * instead of string concatenation when working with Decimal/string values.
 */
describe("Balance Arithmetic Regression Tests", () => {
  let mockDb: any;
  let cache: ModernCacheService;
  let accountService: AccountRegisterService;
  let entryService: RegisterEntryService;
  let transferService: TransferService;
  let mockLoanCalculator: any;

  beforeEach(() => {
    // Reset cache
    cache = new ModernCacheService();

    // Mock database
    mockDb = {
      accountRegister: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    // Mock loan calculator
    mockLoanCalculator = {
      shouldProcessInterest: vi.fn(),
      calculateInterestForAccount: vi.fn(),
      isCreditAccount: vi.fn(),
      calculatePaymentAmount: vi.fn(),
    };

    // Create services
    entryService = new RegisterEntryService(mockDb, cache);
    transferService = new TransferService(cache, entryService);
    accountService = new AccountRegisterService(
      mockDb,
      cache,
      mockLoanCalculator,
      entryService,
      transferService
    );
  });

  describe("AccountRegisterService.updateBalance()", () => {
    it("should perform numeric addition with Decimal balance and numeric amount", () => {
      // Arrange: Account with Decimal balance (simulating database value)
      const account = {
        id: 1,
        balance: new Decimal("-25432.07"), // Prisma Decimal from database
        name: "Test Account",
        typeId: 5,
        budgetId: 1,
        accountId: "test-account",
        latestBalance: 0,
        minPayment: null,
        statementAt: moment(),
        statementIntervalId: 3,
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
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      cache.accountRegister.insert(account);

      // Act: Update balance with numeric amount
      accountService.updateBalance(1, 104.52);

      // Assert: Should result in numeric calculation, not string concatenation
      const updatedAccount = cache.accountRegister.findOne({ id: 1 });
      expect(updatedAccount?.balance).toBe(-25327.55); // -25432.07 + 104.52
      expect(typeof updatedAccount?.balance).toBe("number");

      // Should NOT be string concatenation
      expect(updatedAccount?.balance).not.toBe("-25432.07104.52");
      expect(updatedAccount?.balance).not.toBe(-254320.7104);
    });

    it("should handle string balance values correctly", () => {
      // Arrange: Account with string balance (edge case)
      const account = {
        id: 2,
        balance: "-1500.25" as any, // String balance
        name: "String Balance Account",
        typeId: 1,
        budgetId: 1,
        accountId: "test-account-2",
        latestBalance: 0,
        minPayment: null,
        statementAt: moment(),
        statementIntervalId: 3,
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
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      cache.accountRegister.insert(account);

      // Act: Update with string amount (edge case)
      accountService.updateBalance(2, "50.75" as any);

      // Assert: Should convert both to numbers and calculate correctly
      const updatedAccount = cache.accountRegister.findOne({ id: 2 });
      expect(updatedAccount?.balance).toBe(-1449.5); // -1500.25 + 50.75
      expect(typeof updatedAccount?.balance).toBe("number");
    });

    it("should handle zero amounts correctly", () => {
      // Arrange
      const account = {
        id: 3,
        balance: new Decimal("1000.00"),
        name: "Zero Test Account",
        typeId: 1,
        budgetId: 1,
        accountId: "test-account-3",
        latestBalance: 0,
        minPayment: null,
        statementAt: moment(),
        statementIntervalId: 3,
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
      accountService.updateBalance(3, 0);

      // Assert
      const updatedAccount = cache.accountRegister.findOne({ id: 3 });
      expect(updatedAccount?.balance).toBe(1000);
      expect(typeof updatedAccount?.balance).toBe("number");
    });
  });

  describe("RegisterEntryService balance calculations", () => {
    it("should calculate balance correctly with Decimal account balance", () => {
      // Arrange: Account with Decimal balance
      const account = {
        id: 10,
        balance: new Decimal("500.25"),
        latestBalance: new Decimal("500.25"),
        name: "Entry Test Account",
        typeId: 1,
        budgetId: 1,
        accountId: "test-account-10",
        minPayment: null,
        statementAt: moment(),
        statementIntervalId: 3,
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
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      cache.accountRegister.insert(account);

      // Act: Create entry with Decimal amount
      entryService.createEntry({
        accountRegisterId: 10,
        description: "Test Entry",
        amount: new Decimal("-75.50") as any, // Decimal amount
        forecastDate: new Date(),
      });

      // Assert: Balance should be calculated numerically
      const updatedAccount = cache.accountRegister.findOne({ id: 10 });
      expect(updatedAccount?.balance).toBe(424.75); // 500.25 - 75.50
      expect(typeof updatedAccount?.balance).toBe("number");

      // Verify entry balance is also correct
      const entries = cache.registerEntry.find({ accountRegisterId: 10 });
      expect(entries[0].balance).toBe(424.75);
      expect(typeof entries[0].balance).toBe("number");
    });

    it("should handle createBalanceEntry with Decimal latestBalance", () => {
      // Arrange: Account with Decimal latestBalance
      const account = {
        id: 11,
        balance: new Decimal("0"),
        latestBalance: new Decimal("2500.75"), // Decimal from database
        name: "Balance Entry Test",
        typeId: 2,
        budgetId: 1,
        accountId: "test-account-11",
        minPayment: null,
        statementAt: moment(),
        statementIntervalId: 3,
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
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      cache.accountRegister.insert(account);

      // Act: Create balance entry
      entryService.createBalanceEntry(account);

      // Assert: Account balance should be set to numeric value
      const updatedAccount = cache.accountRegister.findOne({ id: 11 });
      expect(updatedAccount?.balance).toBe(2500.75);
      expect(typeof updatedAccount?.balance).toBe("number");

      // Verify balance entry amount
      const balanceEntry = cache.registerEntry.find({
        accountRegisterId: 11,
        isBalanceEntry: true,
      })[0];
      expect(balanceEntry.amount).toBe(2500.75);
      expect(typeof balanceEntry.amount).toBe("number");
    });
  });

  describe("TransferService projected balance calculations", () => {
    it("should calculate projected balance with mixed Decimal/numeric entries", () => {
      // Arrange: Account with Decimal balance and mixed entry amounts
      const account = {
        id: 20,
        balance: new Decimal("1000"),
        latestBalance: new Decimal("1000"),
        name: "Projected Balance Test",
        typeId: 1,
        budgetId: 1,
        accountId: "test-account-20",
        minPayment: null,
        statementAt: moment(),
        statementIntervalId: 3,
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
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      };

      cache.accountRegister.insert(account);

      // Add entries with different value types
      cache.registerEntry.insert({
        id: "entry1",
        seq: null,
        accountRegisterId: 20,
        sourceAccountRegisterId: null,
        createdAt: moment(),
        description: "Entry 1",
        reoccurrenceId: null,
        amount: new Decimal("150.25") as any, // Decimal
        balance: 0,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        isReconciled: false,
      });

      cache.registerEntry.insert({
        id: "entry2",
        seq: null,
        accountRegisterId: 20,
        sourceAccountRegisterId: null,
        createdAt: moment(),
        description: "Entry 2",
        reoccurrenceId: null,
        amount: -75.5, // Regular number
        balance: 0,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        isReconciled: false,
      });

      cache.registerEntry.insert({
        id: "entry3",
        seq: null,
        accountRegisterId: 20,
        sourceAccountRegisterId: null,
        createdAt: moment(),
        description: "Entry 3",
        reoccurrenceId: null,
        amount: "25.75" as any, // String number
        balance: 0,
        isBalanceEntry: false,
        isPending: false,
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        isReconciled: false,
      });

      // Act: Calculate projected balance (using private method through reflection)
      const result = (transferService as any).calculateProjectedBalanceAtDate(
        20,
        new Date()
      );

      // Assert: Should sum correctly: 1000 + 150.25 - 75.50 + 25.75 = 1100.50
      expect(result).toBe(1100.5);
      expect(typeof result).toBe("number");

      // Should NOT be string concatenation like "1000150.25-75.5025.75"
      expect(result).not.toBe("1000150.25-75.5025.75");
      expect(result).not.toBe(1000150.25);
    });
  });

  describe("Real-world scenario: GM Financial bug reproduction", () => {
    it("should prevent the exact GM Financial balance corruption scenario", () => {
      // Arrange: Recreate the exact scenario that caused the bug
      const gmAccount = {
        id: 8,
        balance: new Decimal("-25432.07"), // Original GM Financial balance
        latestBalance: new Decimal("-25432.07"),
        name: "GM Financial",
        typeId: 5,
        budgetId: 1,
        accountId: "test-gm",
        minPayment: new Decimal("803.05"),
        statementAt: moment("2025-08-09"),
        statementIntervalId: 3,
        apr1: new Decimal("0.05"),
        apr1StartAt: null,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
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

      cache.accountRegister.insert(gmAccount);

      // Act: Simulate the operations that caused corruption
      // 1. Interest charge
      entryService.createEntry({
        accountRegisterId: 8,
        description: "Interest Charge",
        amount: new Decimal("104.52"), // Interest as Decimal
        forecastDate: new Date("2025-08-09"),
      });

      // 2. Payment
      entryService.createEntry({
        accountRegisterId: 8,
        description: "Min Payment",
        amount: new Decimal("803.05"), // Payment as Decimal
        forecastDate: new Date("2025-08-09"),
      });

      // Assert: Balance should be calculated correctly, not concatenated
      const finalAccount = cache.accountRegister.findOne({ id: 8 });

      // Expected: -25432.07 + 104.52 + 803.05 = -24524.50
      expect(finalAccount?.balance).toBe(-24524.5);
      expect(typeof finalAccount?.balance).toBe("number");

      // Should NOT be the corrupted concatenation we saw in the bug
      expect(finalAccount?.balance).not.toBe("-25432.07104.52803.05");
      expect(finalAccount?.balance.toString()).not.toContain("25432.07104.52");
    });
  });
});
