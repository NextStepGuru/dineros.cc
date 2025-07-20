import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import moment from 'moment';
import { AccountRegisterService } from '../AccountRegisterService';
import { ModernCacheService } from '../ModernCacheService';
import { LoanCalculatorService } from '../LoanCalculatorService';
import { RegisterEntryService } from '../RegisterEntryService';
import { TransferService } from '../TransferService';
import type { CacheAccountRegister } from '../ModernCacheService';

describe('AccountRegisterService', () => {
  let service: AccountRegisterService;
  let mockDb: any;
  let mockCache: {
    accountRegister: any;
  };
  let mockLoanCalculator: any;
  let mockEntryService: any;
  let mockTransferService: any;

  beforeEach(() => {
    // Mock PrismaClient
    mockDb = {
      accountRegister: {
        update: vi.fn(),
      },
    };

    // Mock cache service
    mockCache = {
      accountRegister: {
        findOne: vi.fn(),
        find: vi.fn(),
        update: vi.fn(),
      },
    };

    // Mock other services
    mockLoanCalculator = {
      shouldProcessInterest: vi.fn(),
      calculateInterestForAccount: vi.fn(),
      calculatePaymentAmount: vi.fn(),
      calculateMinPayment: vi.fn(),
    };

    mockEntryService = {
      createEntry: vi.fn(),
      createBalanceEntry: vi.fn(),
    };

    mockTransferService = {
      transferBetweenAccountsWithDate: vi.fn(),
    };

    service = new AccountRegisterService(
      mockDb,
      mockCache as any,
      mockLoanCalculator,
      mockEntryService,
      mockTransferService
    );

    // Mock console.log to avoid test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockAccount(overrides: Partial<CacheAccountRegister> = {}): CacheAccountRegister {
    return {
      id: 1,
      typeId: 1,
      budgetId: 1,
      accountId: 'test-account',
      name: 'Test Account',
      balance: 1000,
      latestBalance: 1000,
      minPayment: null,
      statementAt: moment('2024-01-15'),
      apr1: 0.15,
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
      minAccountBalance: 500,
      allowExtraPayment: false,
      isArchived: false,
      plaidId: null,
      ...overrides,
    } as CacheAccountRegister;
  }

  describe('updateBalance', () => {
    it('should update account balance when account exists', () => {
      const account = createMockAccount({ id: 1, balance: 1000 });
      mockCache.accountRegister.findOne.mockReturnValue(account);

      service.updateBalance(1, 500);

      expect(mockCache.accountRegister.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(account.balance).toBe(1500);
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);
    });

    it('should handle negative amount updates', () => {
      const account = createMockAccount({ id: 1, balance: 1000 });
      mockCache.accountRegister.findOne.mockReturnValue(account);

      service.updateBalance(1, -300);

      expect(account.balance).toBe(700);
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);
    });

    it('should do nothing when account does not exist', () => {
      mockCache.accountRegister.findOne.mockReturnValue(null);

      service.updateBalance(999, 500);

      expect(mockCache.accountRegister.findOne).toHaveBeenCalledWith({ id: 999 });
      expect(mockCache.accountRegister.update).not.toHaveBeenCalled();
    });
  });

  describe('getAccount', () => {
    it('should return account when found', () => {
      const account = createMockAccount({ id: 1 });
      mockCache.accountRegister.findOne.mockReturnValue(account);

      const result = service.getAccount(1);

      expect(result).toBe(account);
      expect(mockCache.accountRegister.findOne).toHaveBeenCalledWith({ id: 1 });
    });

    it('should return null when account not found', () => {
      mockCache.accountRegister.findOne.mockReturnValue(null);

      const result = service.getAccount(999);

      expect(result).toBeNull();
      expect(mockCache.accountRegister.findOne).toHaveBeenCalledWith({ id: 999 });
    });
  });

  describe('processInterestCharges', () => {
    it('should process interest for eligible accounts', async () => {
      const account1 = createMockAccount({ id: 1, name: 'Account 1' });
      const account2 = createMockAccount({ id: 2, name: 'Account 2' });
      const accounts = [account1, account2];

      // Mock loan calculator - it's called in the forEach AND in the filter
      mockLoanCalculator.shouldProcessInterest
        .mockReturnValueOnce(true)   // forEach call for account1
        .mockReturnValueOnce(false)  // forEach call for account2
        .mockReturnValueOnce(true)   // filter call for account1
        .mockReturnValueOnce(false); // filter call for account2

      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-50); // Negative = interest charge
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(100);

      const forecastDate = moment('2024-01-01');

      await service.processInterestCharges(accounts, forecastDate);

      expect(mockLoanCalculator.shouldProcessInterest).toHaveBeenCalledTimes(4);
      expect(mockLoanCalculator.calculateInterestForAccount).toHaveBeenCalledWith(account1);
      expect(mockLoanCalculator.calculatePaymentAmount).toHaveBeenCalledWith(account1, 50);
      expect(mockEntryService.createEntry).toHaveBeenCalled();
    });

    it('should handle accounts with no interest charges', async () => {
      const account = createMockAccount({ id: 1 });
      const accounts = [account];

      mockLoanCalculator.shouldProcessInterest.mockReturnValue(true);
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(0); // No interest
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(0);

      await service.processInterestCharges(accounts);

      expect(mockLoanCalculator.calculateInterestForAccount).toHaveBeenCalledWith(account);
      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
    });

    it('should handle empty accounts array', async () => {
      await service.processInterestCharges([]);

      expect(mockLoanCalculator.shouldProcessInterest).not.toHaveBeenCalled();
      expect(mockLoanCalculator.calculateInterestForAccount).not.toHaveBeenCalled();
    });

    it('should process without forecast date', async () => {
      const account = createMockAccount({ id: 1 });
      mockLoanCalculator.shouldProcessInterest.mockReturnValue(true);
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-25);
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(50);

      await service.processInterestCharges([account]); // No forecastDate

      expect(mockLoanCalculator.shouldProcessInterest).toHaveBeenCalledWith(account, undefined);
    });
  });

  describe('processAccountInterestCharge', () => {
    it('should create interest charge and transfer payment', async () => {
      const account = createMockAccount({
        id: 1,
        name: 'Credit Card',
        targetAccountRegisterId: 2,
      });

      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-75); // Interest charge
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(150);
      mockDb.accountRegister.update.mockResolvedValue({});

      const forecastDate = moment('2024-01-01');

      await (service as any).processAccountInterestCharge(account, forecastDate);

      // Should create interest charge entry
      expect(mockEntryService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          accountRegisterId: 1,
          description: 'Interest Charge',
          amount: 75, // Absolute value
          sourceAccountRegisterId: 2,
          reoccurrence: expect.objectContaining({
            accountRegisterId: 1,
            amount: 75,
            transferAccountRegisterId: 2,
          }),
        })
      );

      // Should create transfer for payment
      expect(mockTransferService.transferBetweenAccountsWithDate).toHaveBeenCalledWith(
        expect.objectContaining({
          targetAccountRegisterId: 1,
          sourceAccountRegisterId: 2,
          amount: 150,
          description: 'Min Payment to Credit Card',
          reoccurrence: expect.objectContaining({
            accountRegisterId: 1,
            amount: 150,
            description: 'Min Payment to Credit Card',
          }),
        })
      );
    });

    it('should create direct payment when no target account', async () => {
      const account = createMockAccount({
        id: 1,
        name: 'Loan Account',
        targetAccountRegisterId: null,
      });

      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-30);
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(100);
      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).processAccountInterestCharge(account);

      // Should create direct payment entry
      expect(mockEntryService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          accountRegisterId: 1,
          description: 'Payment for Loan Account',
          amount: 100,
        })
      );

      expect(mockTransferService.transferBetweenAccountsWithDate).not.toHaveBeenCalled();
    });

    it('should handle positive interest (rare case)', async () => {
      const account = createMockAccount({ id: 1 });

      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(25); // Positive interest
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(0);
      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).processAccountInterestCharge(account);

      // Should not create interest charge entry for positive interest
      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
      expect(mockTransferService.transferBetweenAccountsWithDate).not.toHaveBeenCalled();
    });
  });

  describe('updateStatementDates', () => {
    it('should update statement dates for all accounts', async () => {
      const accounts = [
        createMockAccount({ id: 1 }),
        createMockAccount({ id: 2 }),
      ];

      const updateSpy = vi.spyOn(service as any, 'updateStatementDate').mockResolvedValue(undefined);
      const forecastDate = moment('2024-01-01');

      await service.updateStatementDates(accounts, forecastDate);

      expect(updateSpy).toHaveBeenCalledTimes(2);
      expect(updateSpy).toHaveBeenCalledWith(accounts[0], forecastDate);
      expect(updateSpy).toHaveBeenCalledWith(accounts[1], forecastDate);
    });

    it('should handle empty accounts array', async () => {
      const updateSpy = vi.spyOn(service as any, 'updateStatementDate').mockResolvedValue(undefined);

      await service.updateStatementDates([]);

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateStatementDate', () => {
    it('should update statement date when forecast date is after statement date', async () => {
      const account = createMockAccount({
        id: 1,
        statementAt: moment('2024-01-15'),
      });

      mockDb.accountRegister.update.mockResolvedValue({});
      const forecastDate = moment('2024-01-20'); // After statement date

      await (service as any).updateStatementDate(account, forecastDate);

      // Should update in cache
      expect(account.statementAt.format('YYYY-MM-DD')).toBe('2024-02-15'); // One month later
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);

      // Should update in database (since forecast date is not future)
      expect(mockDb.accountRegister.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { statementAt: expect.any(Date) },
      });
    });

    it('should not update when forecast date is before statement date', async () => {
      const account = createMockAccount({
        id: 1,
        statementAt: moment('2024-01-20'),
      });

      const originalStatementAt = account.statementAt.format('YYYY-MM-DD');
      const forecastDate = moment('2024-01-15'); // Before statement date

      await (service as any).updateStatementDate(account, forecastDate);

      // Should not update
      expect(account.statementAt.format('YYYY-MM-DD')).toBe(originalStatementAt);
      expect(mockCache.accountRegister.update).not.toHaveBeenCalled();
      expect(mockDb.accountRegister.update).not.toHaveBeenCalled();
    });

    it('should update cache but not database for future dates', async () => {
      const account = createMockAccount({
        id: 1,
        statementAt: moment('2024-01-01'),
      });

      // Use vi.spyOn to mock Date instead of moment
      const mockNow = vi.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-05').getTime());

      const forecastDate = moment('2024-01-10'); // Future date

      await (service as any).updateStatementDate(account, forecastDate);

      // Should update in cache
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);

      // Should NOT update in database for future dates
      expect(mockDb.accountRegister.update).not.toHaveBeenCalled();

      mockNow.mockRestore();
    });

    it('should handle no forecast date provided', async () => {
      const account = createMockAccount({
        id: 1,
        statementAt: moment().subtract(1, 'day'), // Yesterday
      });

      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).updateStatementDate(account); // No forecastDate

      // Should use current date for comparison
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);
      expect(mockDb.accountRegister.update).toHaveBeenCalled();
    });
  });

  describe('getAccountsByType', () => {
    it('should return accounts of specified type', () => {
      const accounts = [
        createMockAccount({ id: 1, typeId: 1 }),
        createMockAccount({ id: 2, typeId: 2 }),
        createMockAccount({ id: 3, typeId: 1 }),
      ];

      mockCache.accountRegister.find.mockReturnValue([accounts[0], accounts[2]]);

      const result = service.getAccountsByType(1);

      expect(mockCache.accountRegister.find).toHaveBeenCalledWith({ typeId: 1 });
      expect(result).toHaveLength(2);
      expect(result[0].typeId).toBe(1);
      expect(result[1].typeId).toBe(1);
    });

    it('should return empty array when no accounts match', () => {
      mockCache.accountRegister.find.mockReturnValue([]);

      const result = service.getAccountsByType(999);

      expect(result).toHaveLength(0);
    });
  });

  describe('getInterestBearingAccounts', () => {
    it('should return accounts with target account and non-zero balance', () => {
      const accounts = [
        createMockAccount({ id: 1, targetAccountRegisterId: 2, balance: 1000 }),
        createMockAccount({ id: 2, targetAccountRegisterId: null, balance: 500 }),
        createMockAccount({ id: 3, targetAccountRegisterId: 3, balance: 0 }),
        createMockAccount({ id: 4, targetAccountRegisterId: 4, balance: -500 }),
      ];

      // Mock the find method to handle both object query {} and function filter
      mockCache.accountRegister.find.mockImplementation((query: any) => {
        if (typeof query === 'function') {
          return accounts.filter(query);
        }
        return accounts; // For find({}) call
      });

      const result = service.getInterestBearingAccounts();

      expect(result).toHaveLength(2); // accounts 1 and 4
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(4);
    });

    it('should return empty array when no accounts meet criteria', () => {
      const accounts = [
        createMockAccount({ id: 1, targetAccountRegisterId: null, balance: 1000 }),
        createMockAccount({ id: 2, targetAccountRegisterId: 2, balance: 0 }),
      ];

      // Mock the find method to handle both object query {} and function filter
      mockCache.accountRegister.find.mockImplementation((query: any) => {
        if (typeof query === 'function') {
          return accounts.filter(query);
        }
        return accounts; // For find({}) call
      });

      const result = service.getInterestBearingAccounts();

      expect(result).toHaveLength(0);
    });
  });

  describe('getAccountsWithExtraPayments', () => {
    it('should return accounts with extra payment enabled', () => {
      const accounts = [
        createMockAccount({ id: 1, allowExtraPayment: true }),
        createMockAccount({ id: 2, allowExtraPayment: true }),
      ];

      mockCache.accountRegister.find.mockReturnValue(accounts);

      const result = service.getAccountsWithExtraPayments();

      expect(mockCache.accountRegister.find).toHaveBeenCalledWith({
        allowExtraPayment: true,
      });
      expect(result).toEqual(accounts);
    });

    it('should return empty array when no accounts have extra payments', () => {
      mockCache.accountRegister.find.mockReturnValue([]);

      const result = service.getAccountsWithExtraPayments();

      expect(result).toHaveLength(0);
    });
  });

  describe('isAccountActive', () => {
    it('should return true for non-archived accounts', () => {
      const account = createMockAccount({ isArchived: false });

      const result = service.isAccountActive(account);

      expect(result).toBe(true);
    });

    it('should return false for archived accounts', () => {
      const account = createMockAccount({ isArchived: true });

      const result = service.isAccountActive(account);

      expect(result).toBe(false);
    });
  });

  describe('filterActiveAccounts', () => {
    it('should filter out archived accounts', () => {
      const accounts = [
        createMockAccount({ id: 1, isArchived: false }),
        createMockAccount({ id: 2, isArchived: true }),
        createMockAccount({ id: 3, isArchived: false }),
      ];

      const result = service.filterActiveAccounts(accounts);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(3);
      expect(result.every(acc => !acc.isArchived)).toBe(true);
    });

    it('should return empty array when all accounts are archived', () => {
      const accounts = [
        createMockAccount({ id: 1, isArchived: true }),
        createMockAccount({ id: 2, isArchived: true }),
      ];

      const result = service.filterActiveAccounts(accounts);

      expect(result).toHaveLength(0);
    });

    it('should return all accounts when none are archived', () => {
      const accounts = [
        createMockAccount({ id: 1, isArchived: false }),
        createMockAccount({ id: 2, isArchived: false }),
      ];

      const result = service.filterActiveAccounts(accounts);

      expect(result).toHaveLength(2);
      expect(result).toEqual(accounts);
    });
  });

  describe('createBalanceEntries', () => {
    it('should create balance entries for all accounts', () => {
      const accounts = [
        createMockAccount({ id: 1 }),
        createMockAccount({ id: 2 }),
        createMockAccount({ id: 3 }),
      ];

      service.createBalanceEntries(accounts);

      expect(mockEntryService.createBalanceEntry).toHaveBeenCalledTimes(3);
      expect(mockEntryService.createBalanceEntry).toHaveBeenCalledWith(accounts[0]);
      expect(mockEntryService.createBalanceEntry).toHaveBeenCalledWith(accounts[1]);
      expect(mockEntryService.createBalanceEntry).toHaveBeenCalledWith(accounts[2]);
    });

    it('should handle empty accounts array', () => {
      service.createBalanceEntries([]);

      expect(mockEntryService.createBalanceEntry).not.toHaveBeenCalled();
    });
  });
});
