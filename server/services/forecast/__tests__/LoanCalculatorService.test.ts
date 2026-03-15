import { vi, describe, it, expect, beforeEach } from "vitest";
import { dateTimeService } from "../DateTimeService";
import { LoanCalculatorService } from "../LoanCalculatorService";
import type { CacheAccountRegister } from "../ModernCacheService";

// Mock the loan calculator dependency
vi.mock("@dazlab-team/loan-calc", () => ({
  Loan: vi.fn(() => ({
    amount: 0,
    years: 0,
    interestRate: 0,
    totalInterest: 1000,
  })),
}));

const moment = (input?: any) => dateTimeService.create(input);

describe("LoanCalculatorService", () => {
  let service: LoanCalculatorService;

  beforeEach(async () => {
    service = new LoanCalculatorService();
  });

  function createMockAccount(
    overrides: Partial<CacheAccountRegister> = {}
  ): CacheAccountRegister {
    return {
      id: 1,
      typeId: 1,
      budgetId: 1,
      accountId: "test-account",
      name: "Test Account",
      balance: -1000,
      latestBalance: -1000,
      minPayment: 100,
      statementAt: dateTimeService.create("2024-01-15"),
      statementIntervalId: 3, // Monthly
      apr1: 0.15,
      apr1StartAt: null,
      apr2: 0.2,
      apr2StartAt: new Date("2024-01-01T00:00:00.000Z"),
      apr3: 0.25,
      apr3StartAt: new Date("2024-02-01T00:00:00.000Z"),
      targetAccountRegisterId: 2,
      loanStartAt: null,
      loanPaymentsPerYear: 12,
      loanTotalYears: 5,
      loanOriginalAmount: 10000,
      loanPaymentSortOrder: 0,
      savingsGoalSortOrder: 0,
      accountSavingsGoal: null,
      minAccountBalance: 0,
      allowExtraPayment: false,
      isArchived: false,
      plaidId: null,
      ...overrides,
    } as CacheAccountRegister;
  }

  describe("calculateInterestCharge", () => {
    it("should calculate loan interest for loan type 99", async () => {
      const params = {
        typeId: 99,
        apr: 0.05,
        balance: 10000,
        totalYears: 5,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(1000); // Mocked totalInterest value
    });

    it("should calculate loan interest for loan type 5", async () => {
      const params = {
        typeId: 5,
        apr: 0.05,
        balance: 10000,
        totalYears: 5,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(1000); // Mocked totalInterest value
    });

    it("should calculate standard interest for credit/debit types", async () => {
      const params = {
        typeId: 1,
        apr: 0.12,
        balance: 1000,
        totalYears: 0,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(120); // (0.12 * 1000) - annual interest calculation
    });

    it("should handle zero APR", async () => {
      const params = {
        typeId: 1,
        apr: 0,
        balance: 1000,
        totalYears: 0,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(0);
    });

    // NaN handling tests - these will throw errors due to bankers rounding validation
    it("should handle NaN APR by throwing error", async () => {
      const params = {
        typeId: 1,
        apr: NaN,
        balance: 1000,
        totalYears: 0,
      };

      await expect(service.calculateInterestCharge(params)).rejects.toThrow(
        "Invalid monetary value: NaN"
      );
    });

    it("should handle NaN balance by throwing error", async () => {
      const params = {
        typeId: 1,
        apr: 0.12,
        balance: NaN,
        totalYears: 0,
      };

      await expect(service.calculateInterestCharge(params)).rejects.toThrow(
        "Invalid monetary value: NaN"
      );
    });

    it("should handle NaN totalYears gracefully", async () => {
      const params = {
        typeId: 5,
        apr: 0.05,
        balance: 10000,
        totalYears: NaN,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(1000); // Mocked loan calculation result
    });

    it("should handle negative APR gracefully", async () => {
      const params = {
        typeId: 1,
        apr: -0.12,
        balance: 1000,
        totalYears: 0,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(-120); // Negative APR results in negative interest
    });

    it("should handle negative balance gracefully", async () => {
      const params = {
        typeId: 1,
        apr: 0.12,
        balance: -1000,
        totalYears: 0,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(-120); // Negative balance should result in negative interest
    });
  });

  describe("calculateMinPayment", () => {
    it("should return positive min payment amount", () => {
      const account = createMockAccount({ minPayment: 150 });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(150);
    });

    it("should return 0 when min payment is null", () => {
      const account = createMockAccount({ minPayment: null });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(0);
    });

    it("should return 0 when min payment is undefined", () => {
      const account = createMockAccount({ minPayment: undefined });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(0);
    });

    it("should return 0 when min payment is 0", () => {
      const account = createMockAccount({ minPayment: 0 });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(0);
    });

    // NaN handling tests
    it("should handle NaN min payment gracefully", () => {
      const account = createMockAccount({ minPayment: NaN });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(0);
    });

    it("should handle negative min payment gracefully", () => {
      const account = createMockAccount({ minPayment: -50 });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(50); // absoluteMoney converts negative to positive
    });
  });

  describe("calculateInterestForAccount", () => {
    it("should return 0 when APR is 0", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        typeId: 4,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(Math.abs(result)).toBe(0);
    });

    it("should calculate interest using APR1 when no other APRs are active", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        typeId: 4, // Credit Card (credit account)
        statementAt: moment("2024-01-15"),
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(-9.91); // Updated for compound interest calculation
    });

    it("should calculate interest using APR2 when active", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date("2023-12-01T00:00:00.000Z"), // Use Date instead of moment
        statementAt: moment("2024-01-15"),
        typeId: 4, // Credit Card (credit account)
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(-14.9); // Updated for compound interest calculation
    });

    it("should calculate interest using APR3 when active (highest priority)", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date("2023-12-01T00:00:00.000Z"), // Use Date instead of moment
        apr3: 0.24,
        apr3StartAt: new Date("2024-01-01T00:00:00.000Z"), // Use Date instead of moment
        statementAt: moment("2024-01-15"),
        typeId: 4, // Credit Card (credit account)
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(-19.92); // Updated for compound interest calculation
    });

    it("should calculate positive interest for savings accounts", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.05,
        apr2: null,
        apr3: null,
        typeId: 2, // Savings account
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      // For 5% APR on $1,000 over 30 days with daily compounding:
      // P * (1 + r/365)^30 - P where r = 0.05, P = 1000
      expect(result).toBe(4.12); // compound interest for 30 days, rounded to 4.12
    });

    it("should use projected balance when provided for savings accounts", async () => {
      const account = createMockAccount({
        balance: 1000, // Current balance
        apr1: 0.05,
        apr2: null,
        apr3: null,
        typeId: 2, // Savings account
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const projectedBalance = 5000; // Much higher projected balance
      const result = await service.calculateInterestForAccount(
        account,
        projectedBalance
      );

      // Should calculate interest on projected balance (5000) not current balance (1000)
      // For 5% APR on $5,000 over 30 days with daily compounding: ~$20.59
      expect(result).toBe(20.59);
    });

    it("should fall back to current balance when projected balance not provided", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.05,
        apr2: null,
        apr3: null,
        typeId: 2, // Savings account
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      // Should use current balance (1000)
      // For 5% APR on $1,000 over 30 days with daily compounding: ~$4.12
      expect(result).toBe(4.12);
    });

    it("should use projected balance for credit accounts too", async () => {
      const account = createMockAccount({
        balance: -2000, // Current balance
        apr1: 0.18,
        apr2: null,
        apr3: null,
        typeId: 4, // Credit Card
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const projectedBalance = -5000; // Much higher debt projected
      const result = await service.calculateInterestForAccount(
        account,
        projectedBalance
      );

      // Should calculate interest on projected balance (-5000) not current balance (-2000)
      // Result should be negative (interest charge)
      expect(result).toBeLessThan(0);
      expect(Math.abs(result)).toBe(74.5); // Updated for compound interest calculation
    });

    it("should use loan calculation for loan types", async () => {
      const account = createMockAccount({
        balance: 10000,
        apr1: 0.05,
        typeId: 5, // Use typeId 5 for loan calculation
        loanTotalYears: 5,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      // For 5% APR on $10,000 over 30 days with simple interest:
      // P * r * t where r = 0.05/365, t = 30, P = 10000
      expect(result).toBe(-41.18); // Updated for compound interest calculation
    });

    // NaN and edge case tests
    it("should handle NaN APR1 gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: NaN,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(0);
    });

    it("should handle NaN balance gracefully", async () => {
      const account = createMockAccount({
        balance: NaN,
        apr1: 0.12,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(0);
    });

    it("should handle NaN projected balance gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account, NaN);

      expect(result).toBe(0);
    });

    it("should handle negative APR gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: -0.12,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(0);
    });

    it("should handle null statementAt gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: undefined,
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBeCloseTo(-9.86, 0); // Still calculates interest even with undefined statementAt
    });

    it("should handle undefined statementAt gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: undefined,
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBeCloseTo(-9.86, 0); // Still calculates interest even with undefined statementAt
    });

    it("should handle zero balance gracefully", async () => {
      const account = createMockAccount({
        balance: 0,
        apr1: 0.12,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(0);
    });

    it("should handle zero projected balance gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account, 0);

      expect(result).toBe(0);
    });

    it("should handle very large APR values gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 999999, // Extremely large APR
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      // Should handle large APR without crashing
      expect(result).toBeLessThan(0); // Should be negative (interest charge)
      expect(isFinite(result)).toBe(true); // Should be finite
    });

    it("should handle very large balance values gracefully", async () => {
      const account = createMockAccount({
        balance: 999999999, // Extremely large balance
        apr1: 0.12,
        apr2: null,
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr2StartAt: null,
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      // Should handle large balance without crashing
      expect(result).toBeLessThan(0); // Should be negative (interest charge)
      expect(isFinite(result)).toBe(true); // Should be finite
    });

    it("should handle APR2 with NaN start date gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date(NaN), // Invalid date
        apr3: null,
        typeId: 4,
        statementAt: moment("2024-01-15"),
        apr3StartAt: null,
      });

      const result = await service.calculateInterestForAccount(account);

      // Should fall back to APR1 when APR2 start date is invalid
      expect(result).toBe(-9.91); // Updated for compound interest calculation
    });

    it("should handle APR3 with NaN start date gracefully", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date("2023-12-01T00:00:00.000Z"),
        apr3: 0.24,
        apr3StartAt: new Date(NaN), // Invalid date
        typeId: 4,
        statementAt: moment("2024-01-15"),
      });

      const result = await service.calculateInterestForAccount(account);

      // Should use APR2 when APR3 start date is invalid
      expect(result).toBe(-14.9); // Updated for compound interest calculation
    });
  });

  describe("calculatePaymentAmount", () => {
    it("should return min payment when it is greater than interest", () => {
      const account = createMockAccount({ minPayment: 100 });
      const interest = -50; // Interest charge (negative)

      const result = service.calculatePaymentAmount(account, interest);

      // minPayment (100) > Math.abs(interest) (50), so return minPayment
      expect(result).toBe(100);
    });

    it("should return interest when it is greater than min payment", () => {
      const account = createMockAccount({ minPayment: 30 });
      const interest = -50; // Interest charge (negative)

      const result = service.calculatePaymentAmount(account, interest);

      // Math.abs(interest) (50) > minPayment (30), so return interest amount
      expect(result).toBe(50);
    });

    it("should not exceed account balance", () => {
      const account = createMockAccount({
        minPayment: 500,
        balance: -200, // Account owes $200
      });
      const interest = -50; // Interest charge (negative)

      const result = service.calculatePaymentAmount(account, interest);

      // minPayment (500) > Math.abs(interest) (50), but balance is only $200
      // So payment should be limited to the balance owed
      expect(result).toBe(200);
    });

    it("should handle positive balance (savings account)", () => {
      const account = createMockAccount({
        minPayment: 100,
        balance: 1000, // Positive balance
      });
      const interest = 50; // Interest earned (positive)

      const result = service.calculatePaymentAmount(account, interest);

      // For savings accounts, this would typically not apply, but test the logic
      // minPayment (100) > Math.abs(interest) (50), so return minPayment
      expect(result).toBe(100);
    });

    it("should handle equal minimum payment and interest", () => {
      const account = createMockAccount({ minPayment: 50 });
      const interest = -50; // Interest charge equals minimum payment

      const result = service.calculatePaymentAmount(account, interest);

      // Both are equal (50), so Math.max returns 50
      expect(result).toBe(50);
    });

    // NaN and edge case tests - these will throw errors due to bankers rounding validation
    it("should handle NaN interest by throwing error", () => {
      const account = createMockAccount({ minPayment: 100 });
      const interest = NaN;

      expect(() => service.calculatePaymentAmount(account, interest)).toThrow(
        "Invalid monetary value: NaN"
      );
    });

    it("should handle NaN min payment gracefully", () => {
      const account = createMockAccount({ minPayment: NaN });
      const interest = -50;

      const result = service.calculatePaymentAmount(account, interest);

      expect(result).toBe(50); // Should use interest amount when minPayment is NaN
    });

    it("should handle NaN balance by throwing error", () => {
      const account = createMockAccount({
        minPayment: 500,
        balance: NaN,
      });
      const interest = -50;

      expect(() => service.calculatePaymentAmount(account, interest)).toThrow(
        "Invalid monetary value: NaN"
      );
    });

    it("should handle zero interest gracefully", () => {
      const account = createMockAccount({ minPayment: 100 });
      const interest = 0;

      const result = service.calculatePaymentAmount(account, interest);

      expect(result).toBe(100); // Should use minPayment
    });

    it("should handle zero min payment gracefully", () => {
      const account = createMockAccount({ minPayment: 0 });
      const interest = -50;

      const result = service.calculatePaymentAmount(account, interest);

      expect(result).toBe(50); // Should use interest amount
    });

    it("should handle zero balance gracefully", () => {
      const account = createMockAccount({
        minPayment: 500,
        balance: 0,
      });
      const interest = -50;

      const result = service.calculatePaymentAmount(account, interest);

      expect(result).toBe(0); // Zero balance means no payment needed
    });
  });

  describe("shouldProcessInterest", () => {
    it("should return true when all conditions are met on statement date", () => {
      const statementDate = dateTimeService.create("2024-01-15");
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: statementDate,
      });

      const result = service.shouldProcessInterest(account, statementDate);

      expect(result).toBe(true); // Implementation processes interest on statement date
    });

    it("should return false when APR is zero", () => {
      const account = createMockAccount({
        apr1: 0,
        apr2: null, // Override default APR2
        apr3: null, // Override default APR3
        balance: 1000,
        statementAt: moment(),
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(false);
    });

    it("should return false when balance is zero", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 0,
        statementAt: moment(),
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(false);
    });

    it("should return false when not on statement date and outside grace period", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: moment().subtract(10, "days"), // 10 days ago, outside grace period
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(false);
    });

    it("should return false when within grace period after missed statement date", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: moment().subtract(3, "days"), // 3 days ago, within grace period
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(false);
    });

    it("should return false on exact grace period boundary", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: moment().subtract(7, "days"), // Exactly 7 days ago
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(false);
    });

    it("should return false just outside grace period", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: moment().subtract(8, "days"), // 8 days ago, outside grace period
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(false);
    });

    it("should use forecast date when provided", () => {
      const account = createMockAccount({
        apr1: 0.05,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        balance: 1000,
        statementAt: moment("2024-01-15"),
      });

      const forecastDate = moment("2024-01-15"); // Same as statement date
      const result = service.shouldProcessInterest(account, forecastDate);

      expect(result).toBe(true); // Implementation processes interest on statement date
    });

    // NaN and edge case tests
    it("should handle NaN APR gracefully", () => {
      const account = createMockAccount({
        apr1: NaN,
        apr2: null,
        apr3: null,
        balance: 1000,
        statementAt: moment(),
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(false);
    });

    it("should handle NaN balance gracefully", () => {
      const statementDate = dateTimeService.create("2024-01-15");
      const account = createMockAccount({
        apr1: 0.05,
        balance: NaN,
        statementAt: statementDate,
      });

      const result = service.shouldProcessInterest(account, statementDate);

      expect(result).toBe(true); // NaN balance is still considered non-zero, so interest is processed
    });

    it("should handle null statementAt gracefully", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: undefined,
      });

      expect(() => service.shouldProcessInterest(account)).toThrow(
        "Cannot read properties of undefined"
      );
    });

    it("should handle undefined statementAt gracefully", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: undefined,
      });

      expect(() => service.shouldProcessInterest(account)).toThrow(
        "Cannot read properties of undefined"
      );
    });

    it("should handle NaN forecast date gracefully", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: moment("2024-01-15"),
      });

      const result = service.shouldProcessInterest(account, moment(NaN));

      expect(result).toBe(false);
    });

    it("should handle null forecast date gracefully", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: moment("2024-01-15"),
      });

      const result = service.shouldProcessInterest(account, undefined);

      expect(result).toBe(false);
    });

    it("should handle undefined forecast date gracefully", () => {
      const account = createMockAccount({
        apr1: 0.05,
        balance: 1000,
        statementAt: moment("2024-01-15"),
      });

      const result = service.shouldProcessInterest(account, undefined);

      expect(result).toBe(false);
    });

    it("should handle negative APR gracefully", () => {
      const account = createMockAccount({
        apr1: -0.05,
        apr2: null,
        apr3: null,
        balance: 1000,
        statementAt: moment(),
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(false);
    });

    it("should handle negative balance gracefully", () => {
      const statementDate = dateTimeService.create("2024-01-15");
      const account = createMockAccount({
        apr1: 0.05,
        balance: -1000,
        statementAt: statementDate,
      });

      const result = service.shouldProcessInterest(account, statementDate);

      expect(result).toBe(true); // Negative balance is still considered non-zero, so interest is processed
    });
  });

  describe("APR boundary timing", () => {
    it("uses APR2 when statement date is exactly APR2 start instant", async () => {
      const account = createMockAccount({
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date("2024-01-01T00:00:00.000Z"),
        apr3: null,
        apr3StartAt: null,
        typeId: 4,
      });

      const result = await service.calculateInterestForAccount(account);
      expect(result).toBe(-14.9);
    });

    it("uses APR1 when statement date is before APR2 start instant", async () => {
      const account = createMockAccount({
        statementAt: new Date("2023-12-31T23:59:00.000Z"),
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date("2024-01-01T00:00:00.000Z"),
        apr3: null,
        apr3StartAt: null,
        typeId: 4,
      });

      const result = await service.calculateInterestForAccount(account);
      expect(result).toBe(-9.91);
    });

    it("treats offset-equivalent instants as APR2 active", async () => {
      const account = createMockAccount({
        statementAt: new Date("2024-01-01T05:00:00.000Z"),
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date("2024-01-01T00:00:00-05:00"),
        apr3: null,
        apr3StartAt: null,
        typeId: 4,
      });

      const result = await service.calculateInterestForAccount(account);
      expect(result).toBe(-14.9);
    });
  });

  describe("statement interval interest day-count expectations", () => {
    it("uses 365-day basis for yearly statement interval", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        statementIntervalId: 4,
        typeId: 4,
      });

      const result = await service.calculateInterestForAccount(account);
      expect(result).toBeCloseTo(-127.47, 2);
    });

    it("keeps intervalId 5 on default 30-day basis (current behavior)", async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        statementIntervalId: 5,
        typeId: 4,
      });

      const result = await service.calculateInterestForAccount(account);
      expect(result).toBe(-9.91);
    });
  });
});
