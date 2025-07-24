import { vi, describe, it, expect, beforeEach } from "vitest";
import { ForecastEngineFactory } from "../index";
import { dateTimeService } from "../DateTimeService";

describe("Balance Arithmetic Regression Tests", () => {
  let mockPrisma: any;
  let engine: any;

  beforeEach(async () => {
    // Mock Prisma with realistic database behavior
    mockPrisma = {
      accountRegister: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      registerEntry: {
        findMany: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({}),
      },
      reoccurrence: {
        findMany: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: new Date() } }),
      },
      reoccurrenceSkip: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    // Create engine using factory
    engine = ForecastEngineFactory.create(mockPrisma);
  });

  it("should handle basic balance arithmetic correctly", async () => {
    // Increase timeout for this test
    console.log("TEST STARTING");

    // Capture console output
    const originalConsoleLog = console.log;
    const logs: string[] = [];
    console.log = (...args: any[]) => {
      logs.push(args.join(" "));
      originalConsoleLog(...args);
    };

    try {
      console.log("Setting up mock data...");

      // Set up mock data
      const testAccountRegister = {
        id: 1,
        typeId: 1,
        budgetId: 1,
        accountId: "test-account",
        name: "Test Account",
        balance: 1000,
        latestBalance: 1000,
        minPayment: null,
        statementAt: dateTimeService.create(),
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
      };

      // Set up mock register entries
      const testEntries = [
        {
          id: "entry-1",
          accountRegisterId: 1,
          description: "Test Entry 1",
          amount: 500,
          balance: 500,
          isBalanceEntry: false,
          isPending: false,
          isCleared: true,
          isProjected: false,
          isManualEntry: true,
          isReconciled: false,
          createdAt: dateTimeService.create(),
        },
        {
          id: "entry-2",
          accountRegisterId: 1,
          description: "Deposit",
          amount: 500,
          balance: 1500,
          isBalanceEntry: false,
          isPending: false,
          isCleared: true,
          isProjected: false,
          isManualEntry: false,
          isReconciled: false,
          createdAt: dateTimeService.create(),
        },
        {
          id: "entry-3",
          accountRegisterId: 1,
          description: "Withdrawal",
          amount: -200,
          balance: 1300,
          isBalanceEntry: false,
          isPending: false,
          isCleared: true,
          isProjected: false,
          isManualEntry: false,
          isReconciled: false,
          createdAt: dateTimeService.create(),
        },
      ];

      // Set up in-memory storage for mocks
      const mockAccountRegisters: any[] = [testAccountRegister];
      const mockRegisterEntries: any[] = [...testEntries];
      const mockReoccurrences: any[] = [
        {
          id: 1,
          accountId: "test-account",
          accountRegisterId: 1,
          description: "Monthly Salary",
          amount: 5000,
          intervalId: 3, // Monthly
          intervalCount: 1,
          lastAt: dateTimeService.create().toDate(),
          endAt: null,
        },
      ];
      const mockReoccurrenceSkips: any[] = [];

      // Mock the database responses with proper implementations
      mockPrisma.accountRegister.findMany.mockImplementation(async (query: any) => {
        if (query?.where?.accountId) {
          return mockAccountRegisters.filter(ar => ar.accountId === query.where.accountId);
        }
        return mockAccountRegisters;
      });

      mockPrisma.registerEntry.findMany.mockImplementation(async (query: any) => {
        if (query?.where?.register?.accountId) {
          return mockRegisterEntries.filter(re => {
            const accountRegister = mockAccountRegisters.find(ar => ar.id === re.accountRegisterId);
            return accountRegister && accountRegister.accountId === query.where.register.accountId;
          });
        }
        if (query?.where?.accountRegisterId) {
          return mockRegisterEntries.filter(re => re.accountRegisterId === query.where.accountRegisterId);
        }
        return mockRegisterEntries;
      });

      mockPrisma.registerEntry.create.mockImplementation(async (data: any) => {
        const entry = { ...data.data, id: data.data.id || `entry-${Date.now()}` };
        mockRegisterEntries.push(entry);
        return entry;
      });

      mockPrisma.registerEntry.createMany.mockImplementation(async (data: any) => {
        data.data.forEach((entry: any) => {
          mockRegisterEntries.push({ ...entry, id: entry.id || `entry-${Date.now()}` });
        });
        return { count: data.data.length };
      });

      mockPrisma.reoccurrence.findMany.mockImplementation(async (query: any) => {
        if (query?.where?.accountId) {
          return mockReoccurrences.filter(r => r.accountId === query.where.accountId);
        }
        return mockReoccurrences;
      });

      mockPrisma.reoccurrenceSkip.findMany.mockImplementation(async (query: any) => {
        if (query?.where?.accountId) {
          return mockReoccurrenceSkips.filter(rs => rs.accountId === query.where.accountId);
        }
        return mockReoccurrenceSkips;
      });

      mockPrisma.reoccurrence.aggregate.mockResolvedValue({ _min: { lastAt: new Date() } });
      mockPrisma.registerEntry.updateMany.mockResolvedValue({});

      // Verify the data was created
      console.log("Mock data set up successfully");

      // Run forecast
      console.log("Calling recalculate...");

      let result;
      try {
        result = await engine.recalculate({
          accountId: "test-account",
          startDate: dateTimeService.create().toDate(),
          endDate: dateTimeService.create().add(1, "month").toDate(),
        });
        console.log("Recalculate result:", result);
      } catch (error) {
        console.error("Error in recalculate:", error);
        console.error("Error stack:", error.stack);
        throw error;
      }

      console.log("Forecast result:", {
        isSuccess: result.isSuccess,
        registerEntriesLength: result.registerEntries?.length,
        errors: result.errors,
        accountRegistersLength: result.accountRegisters?.length,
        datesProcessed: result.datesProcessed,
        resultKeys: Object.keys(result),
      });
      console.log("Full result object:", JSON.stringify(result, null, 2));

      expect(result.isSuccess).toBe(true);
      expect(result.registerEntries.length).toBeGreaterThan(0);

      // Verify balance calculations
      const entries = result.registerEntries;
      const balanceEntries = entries.filter((e) => e.isBalanceEntry);
      expect(balanceEntries.length).toBeGreaterThan(0);

      // Check that running balances are calculated correctly
      let runningBalance = 0;
      for (const entry of entries) {
        if (entry.isBalanceEntry) {
          runningBalance = entry.amount;
        } else {
          runningBalance += entry.amount;
        }
        expect(entry.balance).toBe(runningBalance);
      }
    } finally {
      console.log = originalConsoleLog;
      console.log("Captured logs:", logs);
    }
  });

  it("should handle credit account balance arithmetic", async () => {
    // Set up mock data for credit account
    const creditAccountRegister = {
      id: 2,
      typeId: 2, // Credit account type
      budgetId: 1,
      accountId: "test-credit-account",
      name: "Test Credit Account",
      balance: -1000,
      latestBalance: -1000,
      minPayment: 50,
      statementAt: dateTimeService.create(),
      statementIntervalId: 1,
      apr1: 0.15,
      apr1StartAt: dateTimeService.create().toDate(),
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
    };

    const creditEntries = [
      {
        id: "credit-entry-1",
        accountRegisterId: 2,
        description: "Initial Credit Balance",
        amount: -1000,
        balance: -1000,
        isBalanceEntry: true,
        isPending: false,
        isCleared: true,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        createdAt: dateTimeService.create(),
      },
      {
        id: "credit-entry-2",
        accountRegisterId: 2,
        description: "Credit Purchase",
        amount: -500,
        balance: -1500,
        isBalanceEntry: false,
        isPending: false,
        isCleared: true,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        createdAt: dateTimeService.create(),
      },
      {
        id: "credit-entry-3",
        accountRegisterId: 2,
        description: "Payment",
        amount: 300,
        balance: -1200,
        isBalanceEntry: false,
        isPending: false,
        isCleared: true,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        createdAt: dateTimeService.create(),
      },
    ];

    // Mock the database responses
    mockPrisma.accountRegister.findMany.mockResolvedValue([
      creditAccountRegister,
    ]);
    mockPrisma.registerEntry.findMany.mockResolvedValue(creditEntries);
    mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
    mockPrisma.reoccurrenceSkip.findMany.mockResolvedValue([]);

    // Run forecast
    const result = await engine.recalculate({
      accountId: "test-credit-account",
      startDate: dateTimeService.create().toDate(),
      endDate: dateTimeService.create().add(1, "month").toDate(),
    });

    expect(result.isSuccess).toBe(true);
    expect(result.registerEntries.length).toBeGreaterThan(0);

    // Verify credit account balance calculations
    const entries = result.registerEntries;
    const balanceEntries = entries.filter((e) => e.isBalanceEntry);
    expect(balanceEntries.length).toBeGreaterThan(0);

    // Check that running balances are calculated correctly for credit account
    let runningBalance = 0;
    for (const entry of entries) {
      if (entry.isBalanceEntry) {
        runningBalance = entry.amount;
      } else {
        runningBalance += entry.amount;
      }
      expect(entry.balance).toBe(runningBalance);
    }
  });

  it("should handle complex balance scenarios", async () => {
    // Set up mock data for complex account
    const complexAccountRegister = {
      id: 3,
      typeId: 1,
      budgetId: 1,
      accountId: "test-complex-account",
      name: "Test Complex Account",
      balance: 5000,
      latestBalance: 5000,
      minPayment: null,
      statementAt: dateTimeService.create("2025-08-09"),
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
    };

    const complexEntries = [
      {
        id: "complex-entry-1",
        accountRegisterId: 3,
        description: "Initial Balance",
        amount: 5000,
        balance: 5000,
        isBalanceEntry: true,
        isPending: false,
        isCleared: true,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        createdAt: dateTimeService.create(),
      },
      {
        id: "complex-entry-2",
        accountRegisterId: 3,
        description: "Large Deposit",
        amount: 10000,
        balance: 15000,
        isBalanceEntry: false,
        isPending: false,
        isCleared: true,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        createdAt: dateTimeService.create(),
      },
      {
        id: "complex-entry-3",
        accountRegisterId: 3,
        description: "Multiple Withdrawals",
        amount: -2500,
        balance: 12500,
        isBalanceEntry: false,
        isPending: false,
        isCleared: true,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        createdAt: dateTimeService.create(),
      },
      {
        id: "complex-entry-4",
        accountRegisterId: 3,
        description: "Another Withdrawal",
        amount: -3000,
        balance: 9500,
        isBalanceEntry: false,
        isPending: false,
        isCleared: true,
        isProjected: false,
        isManualEntry: false,
        isReconciled: false,
        createdAt: dateTimeService.create(),
      },
    ];

    // Mock the database responses
    mockPrisma.accountRegister.findMany.mockResolvedValue([
      complexAccountRegister,
    ]);
    mockPrisma.registerEntry.findMany.mockResolvedValue(complexEntries);
    mockPrisma.reoccurrence.findMany.mockResolvedValue([]);
    mockPrisma.reoccurrenceSkip.findMany.mockResolvedValue([]);

    // Run forecast
    const result = await engine.recalculate({
      accountId: "test-complex-account",
      startDate: dateTimeService.create().toDate(),
      endDate: dateTimeService.create().add(1, "month").toDate(),
    });

    expect(result.isSuccess).toBe(true);
    expect(result.registerEntries.length).toBeGreaterThan(0);

    // Verify complex balance calculations
    const entries = result.registerEntries;
    const balanceEntries = entries.filter((e) => e.isBalanceEntry);
    expect(balanceEntries.length).toBeGreaterThan(0);

    // Check that running balances are calculated correctly
    let runningBalance = 0;
    for (const entry of entries) {
      if (entry.isBalanceEntry) {
        runningBalance = entry.amount;
      } else {
        runningBalance += entry.amount;
      }
      expect(entry.balance).toBe(runningBalance);
    }
  });
});
