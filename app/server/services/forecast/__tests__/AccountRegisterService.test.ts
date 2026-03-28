import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { AccountRegisterService } from "../AccountRegisterService";
import type { CacheAccountRegister } from "../ModernCacheService";
import { dateTimeService } from "../DateTimeService";
import { forecastLogger } from "../logger";

function createMockAccount(
  overrides: Partial<CacheAccountRegister> = {},
): CacheAccountRegister {
  return {
    id: 1,
    typeId: 1,
    budgetId: 1,
    accountId: "test-account",
    name: "Test Account",
    balance: 1000,
    latestBalance: 1000,
    minPayment: null,
    statementAt: dateTimeService.create("2024-01-15").toDate(),
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
  } as CacheAccountRegister;
}

describe("AccountRegisterService", () => {
  let service: AccountRegisterService;
  let mockDb: any;
  let mockCache: {
    accountRegister: any;
    registerEntry: any;
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
      registerEntry: {
        find: vi.fn(),
      },
    };

    // Mock other services
    mockLoanCalculator = {
      shouldProcessInterest: vi.fn(),
      calculateInterestForAccount: vi.fn(),
      calculatePaymentAmount: vi.fn(),
      calculateMinPayment: vi.fn(),
      isCreditAccount: vi.fn(),
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
      mockTransferService,
    );

    // Mock forecastLogger to avoid test output
    vi.spyOn(forecastLogger, "debug").mockImplementation(() => {});
    vi.spyOn(forecastLogger, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("updateBalance", () => {
    it("should update account balance when account exists", () => {
      const account = createMockAccount({ id: 1, balance: 1000 });
      mockCache.accountRegister.findOne.mockReturnValue(account);

      service.updateBalance(1, 500);

      expect(mockCache.accountRegister.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(account.balance).toBe(1500);
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);
    });

    it("should handle negative amount updates", () => {
      const account = createMockAccount({ id: 1, balance: 1000 });
      mockCache.accountRegister.findOne.mockReturnValue(account);

      service.updateBalance(1, -300);

      expect(account.balance).toBe(700);
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);
    });

    it("should do nothing when account does not exist", () => {
      mockCache.accountRegister.findOne.mockReturnValue(null);

      service.updateBalance(999, 500);

      expect(mockCache.accountRegister.findOne).toHaveBeenCalledWith({
        id: 999,
      });
      expect(mockCache.accountRegister.update).not.toHaveBeenCalled();
    });
  });

  describe("getAccount", () => {
    it("should return account when found", () => {
      const account = createMockAccount({ id: 1 });
      mockCache.accountRegister.findOne.mockReturnValue(account);

      const result = service.getAccount(1);

      expect(result).toBe(account);
      expect(mockCache.accountRegister.findOne).toHaveBeenCalledWith({ id: 1 });
    });

    it("should return null when account not found", () => {
      mockCache.accountRegister.findOne.mockReturnValue(null);

      const result = service.getAccount(999);

      expect(result).toBeNull();
      expect(mockCache.accountRegister.findOne).toHaveBeenCalledWith({
        id: 999,
      });
    });
  });

  describe("processInterestCharges", () => {
    it("should process interest for eligible accounts", async () => {
      const account1 = createMockAccount({ id: 1, name: "Account 1" });
      const account2 = createMockAccount({ id: 2, name: "Account 2" });
      const accounts = [account1, account2];

      // Mock loan calculator to handle the while loop properly
      mockLoanCalculator.shouldProcessInterest
        .mockReturnValueOnce(true) // First call for account1 - should process
        .mockReturnValueOnce(false) // Second call for account1 - stop processing
        .mockReturnValueOnce(false); // Call for account2 - no processing

      mockLoanCalculator.isCreditAccount.mockReturnValue(true); // Credit account
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-50); // Negative = interest charge
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(100);

      const forecastDate = dateTimeService.create("2024-01-01");

      await service.processInterestCharges(accounts, forecastDate);

      expect(mockLoanCalculator.shouldProcessInterest).toHaveBeenCalledTimes(3);
      expect(
        mockLoanCalculator.calculateInterestForAccount,
      ).toHaveBeenCalledWith(account1, 0); // Should include projected balance parameter
      expect(mockLoanCalculator.calculatePaymentAmount).toHaveBeenCalledWith(
        account1,
        -50,
        0,
        expect.any(Date),
      );
      expect(mockEntryService.createEntry).toHaveBeenCalled();
    });

    it("should handle accounts with no interest charges", async () => {
      const account = createMockAccount({ id: 1 });
      const accounts = [account];

      mockLoanCalculator.shouldProcessInterest
        .mockReturnValueOnce(true) // First call - should process
        .mockReturnValueOnce(false); // Second call - stop processing
      mockLoanCalculator.isCreditAccount.mockReturnValue(true); // Credit account
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(0); // No interest
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(0);

      await service.processInterestCharges(accounts);

      expect(
        mockLoanCalculator.calculateInterestForAccount,
      ).toHaveBeenCalledWith(account, 0); // Should include projected balance parameter
      expect(mockEntryService.createEntry).not.toHaveBeenCalled();
    });

    it("should handle empty accounts array", async () => {
      await service.processInterestCharges([]);

      expect(mockLoanCalculator.shouldProcessInterest).not.toHaveBeenCalled();
      expect(
        mockLoanCalculator.calculateInterestForAccount,
      ).not.toHaveBeenCalled();
    });

    it("should process without forecast date", async () => {
      const account = createMockAccount({ id: 1 });
      mockLoanCalculator.shouldProcessInterest
        .mockReturnValueOnce(true) // First call - should process
        .mockReturnValueOnce(false); // Second call - stop processing
      mockLoanCalculator.isCreditAccount.mockReturnValue(true); // Credit account
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-25);
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(50);

      await service.processInterestCharges([account]); // No forecastDate

      expect(mockLoanCalculator.shouldProcessInterest).toHaveBeenCalledWith(
        account,
        undefined,
      );
    });
  });

  describe("processAccountInterestCharge", () => {
    it("should create interest charge and transfer payment", async () => {
      const account = createMockAccount({
        id: 1,
        name: "Credit Card",
        targetAccountRegisterId: 2,
      });

      mockLoanCalculator.isCreditAccount.mockReturnValue(true); // Credit account
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-75); // Interest charge
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(150);
      mockDb.accountRegister.update.mockResolvedValue({});

      const forecastDate = dateTimeService.create("2024-01-01");

      await (service as any).processAccountInterestCharge(
        account,
        forecastDate,
      );

      // Should create interest charge entry (signed amount so running balance is correct)
      expect(mockEntryService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          accountRegisterId: 1,
          description: "Interest Charge",
          amount: -75, // Negative for credit account (increases debt)
          sourceAccountRegisterId: 2,
          forecastDate: expect.any(Date),
          reoccurrence: expect.objectContaining({
            accountRegisterId: 1,
            amount: expect.any(Object), // Decimal object
            transferAccountRegisterId: 2,
            description: "Credit Card",
            intervalId: undefined,
            intervalCount: 1,
            id: 0,
            lastAt: expect.any(Date),
            updatedAt: expect.any(Date),
            adjustBeforeIfOnWeekend: false,
            endAt: null,
            totalIntervals: null,
            elapsedIntervals: null,
          }),
        }),
      );

      // Should create transfer for payment
      expect(
        mockTransferService.transferBetweenAccountsWithDate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          targetAccountRegisterId: 1,
          sourceAccountRegisterId: 2,
          amount: 150,
          description: "Payment to Credit Card",
          forecastDate: expect.any(Date),
          reoccurrence: expect.objectContaining({
            accountRegisterId: 1,
            amount: expect.any(Object), // Decimal object
            description: "Payment to Credit Card",
            intervalId: undefined,
            intervalCount: 1,
            id: 0,
            lastAt: expect.any(Date),
            updatedAt: expect.any(Date),
            adjustBeforeIfOnWeekend: false,
            endAt: null,
            totalIntervals: null,
            elapsedIntervals: null,
            transferAccountRegisterId: 2,
          }),
        }),
      );
    });

    it("should create direct payment when no target account", async () => {
      const account = createMockAccount({
        id: 1,
        name: "Loan Account",
        targetAccountRegisterId: null,
      });

      mockLoanCalculator.isCreditAccount.mockReturnValue(true); // Credit account
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-30);
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(100);
      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).processAccountInterestCharge(account);

      // Should create direct payment entry
      expect(mockEntryService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          accountRegisterId: 1,
          description: "Payment for Loan Account",
          amount: 100,
        }),
      );

      expect(
        mockTransferService.transferBetweenAccountsWithDate,
      ).not.toHaveBeenCalled();
    });

    it("should handle positive interest (rare case)", async () => {
      const account = createMockAccount({ id: 1 });

      mockLoanCalculator.isCreditAccount.mockReturnValue(false); // Savings account
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(25); // Positive interest
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(0);
      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).processAccountInterestCharge(account);

      // Should create interest earned entry for positive interest on savings account
      expect(mockEntryService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          accountRegisterId: 1,
          description: "Interest Earned",
          amount: 25,
        }),
      );
      expect(
        mockTransferService.transferBetweenAccountsWithDate,
      ).not.toHaveBeenCalled();
    });

    it("should use projected balance for interest calculation", async () => {
      const account = createMockAccount({
        id: 1,
        name: "Savings Account",
        latestBalance: 1000,
      });

      // Mock account lookup for calculateProjectedBalanceAtDate
      mockCache.accountRegister.findOne.mockReturnValue(account);

      // Mock entries that would increase the balance
      mockCache.registerEntry.find.mockReturnValue([
        {
          accountRegisterId: 1,
          amount: 500,
          isBalanceEntry: false,
          createdAt: dateTimeService.create("2024-01-15").toDate(),
        },
      ]);

      mockLoanCalculator.isCreditAccount.mockReturnValue(false); // Savings account
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(15); // Interest on projected balance
      mockDb.accountRegister.update.mockResolvedValue({});

      const forecastDate = dateTimeService.create("2024-01-16");

      await (service as any).processAccountInterestCharge(
        account,
        forecastDate,
      );

      // Should call calculateInterestForAccount with projected balance
      expect(
        mockLoanCalculator.calculateInterestForAccount,
      ).toHaveBeenCalledWith(
        account,
        1500, // 1000 (latestBalance) + 500 (entry amount) = 1500 projected balance
      );
    });

    const INTEREST_CAT = "11111111-1111-1111-1111-111111111111";
    const PAYMENT_CAT = "22222222-2222-2222-2222-222222222222";

    it("passes interestCategoryId on interest charge and paymentCategoryId on transfer when set", async () => {
      const account = createMockAccount({
        id: 1,
        name: "Credit Card",
        targetAccountRegisterId: 2,
        interestCategoryId: INTEREST_CAT,
        paymentCategoryId: PAYMENT_CAT,
      });

      mockLoanCalculator.isCreditAccount.mockReturnValue(true);
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-75);
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(150);
      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).processAccountInterestCharge(
        account,
        dateTimeService.create("2024-01-01"),
      );

      expect(mockEntryService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Interest Charge",
          categoryId: INTEREST_CAT,
        }),
      );
      expect(
        mockTransferService.transferBetweenAccountsWithDate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: PAYMENT_CAT,
        }),
      );
    });

    it("passes interestCategoryId on interest earned for savings", async () => {
      const account = createMockAccount({
        id: 1,
        interestCategoryId: INTEREST_CAT,
      });

      mockLoanCalculator.isCreditAccount.mockReturnValue(false);
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(25);
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(0);
      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).processAccountInterestCharge(account);

      expect(mockEntryService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Interest Earned",
          categoryId: INTEREST_CAT,
        }),
      );
    });

    it("passes paymentCategoryId on direct payment entry when no target account", async () => {
      const account = createMockAccount({
        id: 1,
        name: "Loan Account",
        targetAccountRegisterId: null,
        paymentCategoryId: PAYMENT_CAT,
      });

      mockLoanCalculator.isCreditAccount.mockReturnValue(true);
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-30);
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(100);
      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).processAccountInterestCharge(account);

      const paymentCalls = vi
        .mocked(mockEntryService.createEntry)
        .mock.calls.filter((c: unknown[]) =>
          (c[0] as { description?: string }).description?.startsWith(
            "Payment for ",
          ),
        );
      expect(paymentCalls).toHaveLength(1);
      expect(paymentCalls[0]![0]).toMatchObject({
        categoryId: PAYMENT_CAT,
        typeId: 4,
      });
    });

    it("uses null categoryId on interest and payment when register has none", async () => {
      const account = createMockAccount({
        id: 1,
        name: "Credit Card",
        targetAccountRegisterId: 2,
        interestCategoryId: null,
        paymentCategoryId: null,
      });

      mockLoanCalculator.isCreditAccount.mockReturnValue(true);
      mockLoanCalculator.calculateInterestForAccount.mockResolvedValue(-10);
      mockLoanCalculator.calculatePaymentAmount.mockReturnValue(20);
      mockDb.accountRegister.update.mockResolvedValue({});

      await (service as any).processAccountInterestCharge(account);

      expect(mockEntryService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Interest Charge",
          categoryId: null,
        }),
      );
      expect(
        mockTransferService.transferBetweenAccountsWithDate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: null,
        }),
      );
    });
  });

  describe("updateStatementDates", () => {
    it("should update statement dates for all accounts", async () => {
      const accounts = [
        createMockAccount({ id: 1 }),
        createMockAccount({ id: 2 }),
      ];

      const updateSpy = vi
        .spyOn(service as any, "updateStatementDate")
        .mockResolvedValue(undefined);
      const forecastDate = dateTimeService.create("2024-01-01");

      await service.updateStatementDates(accounts, forecastDate);

      expect(updateSpy).toHaveBeenCalledTimes(2);
      expect(updateSpy).toHaveBeenCalledWith(accounts[0], forecastDate);
      expect(updateSpy).toHaveBeenCalledWith(accounts[1], forecastDate);
    });

    it("should handle empty accounts array", async () => {
      const updateSpy = vi
        .spyOn(service as any, "updateStatementDate")
        .mockResolvedValue(undefined);

      await service.updateStatementDates([]);

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe("updateStatementDate", () => {
    it("should update statement date when forecast date is after statement date", async () => {
      const account = createMockAccount({
        id: 1,
        statementAt: dateTimeService.create("2024-01-15").toDate(),
      });

      const forecastDate = dateTimeService.create("2024-01-20"); // After statement date

      await (service as any).updateStatementDate(account, forecastDate);

      // Should update in cache (db persistence is done elsewhere via _pendingStatementAtUpdates)
      expect(
        dateTimeService.format(
          "YYYY-MM-DD",
          dateTimeService.createUTC(account.statementAt as any),
        ),
      ).toBe("2024-02-15"); // One month later
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);
    });

    it("should not update when forecast date is before statement date", async () => {
      const account = createMockAccount({
        id: 1,
        statementAt: dateTimeService.create("2024-01-20").toDate(),
      });

      const originalStatementAt = dateTimeService.format(
        "YYYY-MM-DD",
        dateTimeService.createUTC(account.statementAt as any),
      );
      const forecastDate = dateTimeService.create("2024-01-15"); // Before statement date

      await (service as any).updateStatementDate(account, forecastDate);

      // Should not update
      expect(
        dateTimeService.format(
          "YYYY-MM-DD",
          dateTimeService.createUTC(account.statementAt as any),
        ),
      ).toBe(originalStatementAt);
      expect(mockCache.accountRegister.update).not.toHaveBeenCalled();
      expect(mockDb.accountRegister.update).not.toHaveBeenCalled();
    });

    it("should update cache but not database for future dates", async () => {
      const account = createMockAccount({
        id: 1,
        statementAt: dateTimeService.create("2024-01-01").toDate(),
      });

      // Use vi.spyOn to mock Date for deterministic tests
      const mockNow = vi
        .spyOn(Date, "now")
        .mockReturnValue(dateTimeService.create("2024-01-05").valueOf());

      const forecastDate = dateTimeService.create("2024-01-10"); // Future date

      await (service as any).updateStatementDate(account, forecastDate);

      // Should update in cache
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);

      // Should NOT update in database for future dates
      expect(mockDb.accountRegister.update).not.toHaveBeenCalled();

      mockNow.mockRestore();
    });

    it("should handle no forecast date provided", async () => {
      const account = createMockAccount({
        id: 1,
        statementAt: dateTimeService.create().subtract(1, "day").toDate(), // Yesterday
      });

      await (service as any).updateStatementDate(account); // No forecastDate

      // Should use current date for comparison; cache is updated (db persistence is elsewhere)
      expect(mockCache.accountRegister.update).toHaveBeenCalledWith(account);
    });
  });

  describe("getAccountsByType", () => {
    it("should return accounts of specified type", () => {
      const accounts = [
        createMockAccount({ id: 1, typeId: 1 }),
        createMockAccount({ id: 2, typeId: 2 }),
        createMockAccount({ id: 3, typeId: 1 }),
      ];

      mockCache.accountRegister.find.mockReturnValue([
        accounts[0],
        accounts[2],
      ]);

      const result = service.getAccountsByType(1);

      expect(mockCache.accountRegister.find).toHaveBeenCalledWith({
        typeId: 1,
      });
      expect(result).toHaveLength(2);
      expect(result[0]?.typeId).toBe(1);
      expect(result[1]?.typeId).toBe(1);
    });

    it("should return empty array when no accounts match", () => {
      mockCache.accountRegister.find.mockReturnValue([]);

      const result = service.getAccountsByType(999);

      expect(result).toHaveLength(0);
    });
  });

  describe("getInterestBearingAccounts", () => {
    it("should return accounts with target account and non-zero balance", () => {
      const account1 = createMockAccount({
        id: 1,
        targetAccountRegisterId: 2,
        balance: 1000,
      });
      const account2 = createMockAccount({
        id: 2,
        targetAccountRegisterId: null,
        balance: 500,
      });
      const account3 = createMockAccount({
        id: 3,
        targetAccountRegisterId: 3,
        balance: 0,
      });

      const accounts = [account1, account2, account3];

      // Mock to handle filter function
      mockCache.accountRegister.find.mockImplementation((query: any) => {
        if (typeof query === "function") {
          return accounts.filter((item) => query(item));
        }
        return accounts; // For find({}) call
      });

      const result = service.getInterestBearingAccounts();

      expect(result).toEqual([account1]);
    });

    it("should return empty array when no accounts meet criteria", () => {
      const account1 = createMockAccount({
        targetAccountRegisterId: null,
        balance: 1000,
        typeId: 1, // Not savings
      });
      const account2 = createMockAccount({
        targetAccountRegisterId: 2,
        balance: 0,
      });

      const accounts = [account1, account2];

      // Mock to handle filter function
      mockCache.accountRegister.find.mockImplementation((query: any) => {
        if (typeof query === "function") {
          return accounts.filter((item) => query(item));
        }
        return accounts; // For find({}) call
      });

      const result = service.getInterestBearingAccounts();

      expect(result).toEqual([]);
    });

    it("should include savings accounts even without target account", () => {
      const savingsAccount = createMockAccount({
        id: 1,
        typeId: 2, // Savings account
        accruesBalanceGrowth: true,
        targetAccountRegisterId: null,
        balance: 1000,
      });
      const creditAccount = createMockAccount({
        id: 2,
        typeId: 4, // Credit account
        targetAccountRegisterId: 3,
        balance: -500,
      });
      const checkingAccount = createMockAccount({
        id: 3,
        typeId: 1, // Checking account
        targetAccountRegisterId: null,
        balance: 2000,
      });

      const accounts = [savingsAccount, creditAccount, checkingAccount];

      // Mock to handle filter function
      mockCache.accountRegister.find.mockImplementation((query: any) => {
        if (typeof query === "function") {
          return accounts.filter((item) => query(item));
        }
        return accounts; // For find({}) call
      });

      const result = service.getInterestBearingAccounts();

      // Should include savings account (even without target) and credit account (with target)
      expect(result).toEqual([savingsAccount, creditAccount]);
    });
  });

  describe("getAccountsWithExtraPayments", () => {
    it("should return accounts with extra payment enabled", () => {
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

    it("should return empty array when no accounts have extra payments", () => {
      mockCache.accountRegister.find.mockReturnValue([]);

      const result = service.getAccountsWithExtraPayments();

      expect(result).toHaveLength(0);
    });
  });

  describe("isAccountActive", () => {
    it("should return true for non-archived accounts", () => {
      const account = createMockAccount({ isArchived: false });

      const result = service.isAccountActive(account);

      expect(result).toBe(true);
    });

    it("should return false for archived accounts", () => {
      const account = createMockAccount({ isArchived: true });

      const result = service.isAccountActive(account);

      expect(result).toBe(false);
    });
  });

  describe("filterActiveAccounts", () => {
    it("should filter out archived accounts", () => {
      const accounts = [
        createMockAccount({ id: 1, isArchived: false }),
        createMockAccount({ id: 2, isArchived: true }),
        createMockAccount({ id: 3, isArchived: false }),
      ];

      const result = service.filterActiveAccounts(accounts);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe(1);
      expect(result[1]?.id).toBe(3);
      expect(result.every((acc) => !acc.isArchived)).toBe(true);
    });

    it("should return empty array when all accounts are archived", () => {
      const accounts = [
        createMockAccount({ id: 1, isArchived: true }),
        createMockAccount({ id: 2, isArchived: true }),
      ];

      const result = service.filterActiveAccounts(accounts);

      expect(result).toHaveLength(0);
    });

    it("should return all accounts when none are archived", () => {
      const accounts = [
        createMockAccount({ id: 1, isArchived: false }),
        createMockAccount({ id: 2, isArchived: false }),
      ];

      const result = service.filterActiveAccounts(accounts);

      expect(result).toHaveLength(2);
      expect(result).toEqual(accounts);
    });
  });

  describe("createBalanceEntries", () => {
    it("should create balance entries for all accounts", () => {
      const accounts = [
        createMockAccount({ id: 1 }),
        createMockAccount({ id: 2 }),
        createMockAccount({ id: 3 }),
      ];

      service.createBalanceEntries(accounts);

      expect(mockEntryService.createBalanceEntry).toHaveBeenCalledTimes(3);
      expect(mockEntryService.createBalanceEntry).toHaveBeenCalledWith(
        accounts[0],
      );
      expect(mockEntryService.createBalanceEntry).toHaveBeenCalledWith(
        accounts[1],
      );
      expect(mockEntryService.createBalanceEntry).toHaveBeenCalledWith(
        accounts[2],
      );
    });

    it("should handle empty accounts array", () => {
      service.createBalanceEntries([]);

      expect(mockEntryService.createBalanceEntry).not.toHaveBeenCalled();
    });
  });

  describe("calculateNextStatementDate month-end edge cases", () => {
    const utcYmd = (date: any) =>
      dateTimeService.createUTC(date).format("YYYY-MM-DD");

    it("shows Jan 31 monthly overflow behavior in non-leap year (fixed: now skips to Mar 1)", () => {
      dateTimeService.setNowOverride("2023-01-01T00:00:00.000Z");
      try {
        const next = (service as any).calculateNextStatementDate(
          dateTimeService.create("2023-01-31T00:00:00.000Z"),
          3,
        );
        expect(utcYmd(next)).toBe("2023-03-01");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("shows Jan 31 monthly overflow behavior in leap year (fixed: now skips to Mar 1)", () => {
      dateTimeService.setNowOverride("2024-01-01T00:00:00.000Z");
      try {
        const next = (service as any).calculateNextStatementDate(
          dateTimeService.create("2024-01-31T00:00:00.000Z"),
          3,
        );
        expect(utcYmd(next)).toBe("2024-03-01");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("keeps Nov 30 -> Dec 30 for monthly statements", () => {
      dateTimeService.setNowOverride("2024-01-01T00:00:00.000Z");
      try {
        const next = (service as any).calculateNextStatementDate(
          dateTimeService.create("2024-11-30T00:00:00.000Z"),
          3,
        );
        expect(utcYmd(next)).toBe("2024-12-30");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("handles Mar 31 monthly statement by moving to Apr 30", () => {
      dateTimeService.setNowOverride("2024-01-01T00:00:00.000Z");
      try {
        const next = (service as any).calculateNextStatementDate(
          dateTimeService.create("2024-03-31T00:00:00.000Z"),
          3,
        );
        expect(utcYmd(next)).toBe("2024-04-30");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("shows multi-cycle monthly drift from Jan 31 (current behavior)", () => {
      const first = (service as any).calculateNextStatementDate(
        dateTimeService.create("2024-01-31T00:00:00.000Z"),
        3,
      );
      const second = (service as any).calculateNextStatementDate(first, 3);
      const third = (service as any).calculateNextStatementDate(second, 3);

      expect(utcYmd(first)).toBe("2024-03-01");
      expect(utcYmd(second)).toBe("2024-04-01");
      expect(utcYmd(third)).toBe("2024-05-01");
    });

    it("shows multi-cycle monthly drift from Jan 30 (current behavior)", () => {
      const first = (service as any).calculateNextStatementDate(
        dateTimeService.create("2024-01-30T00:00:00.000Z"),
        3,
      );
      const second = (service as any).calculateNextStatementDate(first, 3);

      expect(utcYmd(first)).toBe("2024-02-29");
      expect(utcYmd(second)).toBe("2024-03-29");
    });

    it("advances yearly statement from leap day anchor (current behavior)", () => {
      const first = (service as any).calculateNextStatementDate(
        dateTimeService.create("2024-02-29T00:00:00.000Z"),
        4,
      );
      const second = (service as any).calculateNextStatementDate(first, 4);

      expect(utcYmd(first)).toBe("2025-03-01");
      expect(utcYmd(second)).toBe("2026-03-01");
    });

    it("keeps intervalId 5 on yearly cadence (current once behavior)", () => {
      const first = (service as any).calculateNextStatementDate(
        dateTimeService.create("2024-01-15T00:00:00.000Z"),
        5,
      );
      const second = (service as any).calculateNextStatementDate(first, 5);

      expect(utcYmd(first)).toBe("2025-01-15");
      expect(utcYmd(second)).toBe("2026-01-15");
    });
  });
});
