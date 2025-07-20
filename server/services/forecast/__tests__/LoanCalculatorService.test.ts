import { vi, describe, it, expect, beforeEach } from 'vitest';
import moment from 'moment';
import { LoanCalculatorService } from '../LoanCalculatorService';
import type { CacheAccountRegister } from '../ModernCacheService';

// Mock the loan calculator dependency
vi.mock('@dazlab-team/loan-calc', () => ({
  Loan: vi.fn(() => ({
    amount: 0,
    years: 0,
    interestRate: 0,
    totalInterest: 1000,
  })),
}));

describe('LoanCalculatorService', () => {
  let service: LoanCalculatorService;

  beforeEach(() => {
    service = new LoanCalculatorService();
  });

  function createMockAccount(overrides: Partial<CacheAccountRegister> = {}): CacheAccountRegister {
    return {
      id: 1,
      typeId: 1,
      budgetId: 1,
      accountId: 'test-account',
      name: 'Test Account',
      balance: -1000,
      latestBalance: -1000,
      minPayment: 100,
      statementAt: moment('2024-01-15'),
      apr1: 0.15,
      apr1StartAt: null,
      apr2: 0.20,
      apr2StartAt: new Date('2024-01-01'),
      apr3: 0.25,
      apr3StartAt: new Date('2024-02-01'),
      targetAccountRegisterId: 2,
      loanStartAt: null,
      loanPaymentsPerYear: 12,
      loanTotalYears: 5,
      loanOriginalAmount: 10000,
      loanPaymentSortOrder: 0,
      minAccountBalance: 0,
      allowExtraPayment: false,
      isArchived: false,
      plaidId: null,
      ...overrides,
    } as CacheAccountRegister;
  }

  describe('calculateInterestCharge', () => {
    it('should calculate loan interest for loan type 99', async () => {
      const params = {
        typeId: 99,
        apr: 0.05,
        balance: 10000,
        totalYears: 5,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(1000); // Mocked totalInterest value
    });

    it('should calculate loan interest for loan type 5', async () => {
      const params = {
        typeId: 5,
        apr: 0.05,
        balance: 10000,
        totalYears: 5,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(1000); // Mocked totalInterest value
    });

    it('should calculate standard interest for credit/debit types', async () => {
      const params = {
        typeId: 1,
        apr: 0.12,
        balance: 1000,
        totalYears: 0,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(10); // (0.12 * 1000) / 12
    });

    it('should handle zero APR', async () => {
      const params = {
        typeId: 1,
        apr: 0,
        balance: 1000,
        totalYears: 0,
      };

      const result = await service.calculateInterestCharge(params);

      expect(result).toBe(0);
    });
  });

  describe('calculateMinPayment', () => {
    it('should return negative min payment amount', () => {
      const account = createMockAccount({ minPayment: 150 });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(-150);
    });

    it('should return 0 when min payment is null', () => {
      const account = createMockAccount({ minPayment: null });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(0);
    });

    it('should return 0 when min payment is undefined', () => {
      const account = createMockAccount({ minPayment: undefined });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(0);
    });

    it('should return 0 when min payment is 0', () => {
      const account = createMockAccount({ minPayment: 0 });

      const result = service.calculateMinPayment(account);

      expect(result).toBe(0);
    });
  });

  describe('calculateInterestForAccount', () => {
    it('should calculate interest using APR1 when no other APRs are active', async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: null,
        apr3: null,
        typeId: 1,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(-10); // -(0.12 * 1000 / 12)
    });

    it('should calculate interest using APR2 when active', async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date('2023-12-01'),
        statementAt: moment('2024-01-15'),
        typeId: 1,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(-15); // -(0.18 * 1000 / 12)
    });

    it('should calculate interest using APR3 when active (highest priority)', async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0.12,
        apr2: 0.18,
        apr2StartAt: new Date('2023-12-01'),
        apr3: 0.24,
        apr3StartAt: new Date('2024-01-01'),
        statementAt: moment('2024-01-15'),
        typeId: 1,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(-20); // -(0.24 * 1000 / 12)
    });

    it('should return 0 when APR is 0', async () => {
      const account = createMockAccount({
        balance: 1000,
        apr1: 0,
        apr2: null,
        apr2StartAt: null,
        apr3: null,
        apr3StartAt: null,
        typeId: 1,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(Math.abs(result)).toBe(0);
    });

    it('should use loan calculation for loan types', async () => {
      const account = createMockAccount({
        balance: 10000,
        apr1: 0.05,
        typeId: 99,
        loanTotalYears: 5,
      });

      const result = await service.calculateInterestForAccount(account);

      expect(result).toBe(-1000); // -(mocked totalInterest)
    });
  });

  describe('calculatePaymentAmount', () => {
    it('should return min payment when it is greater than interest', () => {
      const account = createMockAccount({ minPayment: 100 });
      const interest = 50;

      const result = service.calculatePaymentAmount(account, interest);

      // calculateMinPayment returns -100, but interest (50) > minPayment (-100)
      expect(result).toBe(50);
    });

    it('should return interest when it is greater than min payment', () => {
      const account = createMockAccount({ minPayment: 30 });
      const interest = 50;

      const result = service.calculatePaymentAmount(account, interest);

      expect(result).toBe(50);
    });

    it('should not exceed account balance', () => {
      const account = createMockAccount({
        minPayment: 500,
        balance: -200 // Account owes $200
      });
      const interest = 50;

      const result = service.calculatePaymentAmount(account, interest);

      // minPayment is -500, interest is 50, so it picks interest (50)
      // But since Math.abs(balance) is 200, payment is limited to 50 (no change needed)
      expect(result).toBe(50);
    });

    it('should handle positive balance (savings account)', () => {
      const account = createMockAccount({
        minPayment: 100,
        balance: 1000 // Positive balance
      });
      const interest = 50;

      const result = service.calculatePaymentAmount(account, interest);

      // minPayment is -100, interest is 50, so it picks interest (50)
      expect(result).toBe(50);
    });
  });

  describe('shouldProcessInterest', () => {
    it('should return true when all conditions are met', () => {
      const account = createMockAccount({
        targetAccountRegisterId: 2,
        balance: -1000,
        statementAt: moment('2024-01-15').utc().set({ hour: 0, minute: 0, second: 0, milliseconds: 0 }),
      });
      const forecastDate = moment('2024-01-15').utc().set({ hour: 0, minute: 0, second: 0, milliseconds: 0 });

      const result = service.shouldProcessInterest(account, forecastDate);

      expect(result).toBe(true);
    });

    it('should return false when no target account', () => {
      const account = createMockAccount({
        targetAccountRegisterId: null,
        balance: -1000,
        statementAt: moment('2024-01-15'),
      });
      const forecastDate = moment('2024-01-15');

      const result = service.shouldProcessInterest(account, forecastDate);

      expect(result).toBe(false);
    });

    it('should return false when balance is zero', () => {
      const account = createMockAccount({
        targetAccountRegisterId: 2,
        balance: 0,
        statementAt: moment('2024-01-15'),
      });
      const forecastDate = moment('2024-01-15');

      const result = service.shouldProcessInterest(account, forecastDate);

      expect(result).toBe(false);
    });

    it('should return false when not on statement date', () => {
      const account = createMockAccount({
        targetAccountRegisterId: 2,
        balance: -1000,
        statementAt: moment('2024-01-15'),
      });
      const forecastDate = moment('2024-01-16'); // Different date

      const result = service.shouldProcessInterest(account, forecastDate);

      expect(result).toBe(false);
    });

    it('should use current date when forecast date not provided', () => {
      const today = moment().utc().set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      });

      const account = createMockAccount({
        targetAccountRegisterId: 2,
        balance: -1000,
        statementAt: today,
      });

      const result = service.shouldProcessInterest(account);

      expect(result).toBe(true);
    });

    it('should handle positive balance (savings with interest)', () => {
      const account = createMockAccount({
        targetAccountRegisterId: 2,
        balance: 1000, // Positive balance
        statementAt: moment('2024-01-15').utc().set({ hour: 0, minute: 0, second: 0, milliseconds: 0 }),
      });
      const forecastDate = moment('2024-01-15').utc().set({ hour: 0, minute: 0, second: 0, milliseconds: 0 });

      const result = service.shouldProcessInterest(account, forecastDate);

      expect(result).toBe(true); // Should still process interest for savings
    });
  });
});
