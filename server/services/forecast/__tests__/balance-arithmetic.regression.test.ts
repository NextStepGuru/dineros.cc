import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngineFactory } from "../index";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient } from "@prisma/client";
import { dateTimeService } from "../DateTimeService";

describe("Balance Arithmetic Regression Tests", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  it("should handle basic balance arithmetic correctly", async () => {
    console.log("TEST STARTING");

    // Capture console output
    const originalConsoleLog = console.log;
    const logs: string[] = [];
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
      originalConsoleLog(...args);
    };

    try {
      console.log("Creating test account register...");
      // Create test account register
      const accountRegister = await db.accountRegister.create({
      data: {
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
      },
    });

    // Create test register entries
    console.log("Creating register entries...");

    // Create entries one by one to ensure they're properly stored
    const entry1 = await db.registerEntry.create({
      data: {
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
    });
    console.log("Entry 1 created:", entry1);

    const entry2 = await db.registerEntry.create({
      data: {
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
    });
    console.log("Entry 2 created:", entry2);

    const entry3 = await db.registerEntry.create({
      data: {
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
    });
    console.log("Entry 3 created:", entry3);

  // Verify the data was created
  const allEntries = await db.registerEntry.findMany();
  console.log("All register entries in DB:", allEntries);

    // Run forecast
    console.log("Creating forecast engine...");
    const engine = ForecastEngineFactory.create(db);
    console.log("Forecast engine created:", engine);
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
      console.log('Captured logs:', logs);
    }
  });

  it("should handle credit account balance arithmetic", async () => {
    // Create test credit account register
    const accountRegister = await db.accountRegister.create({
      data: {
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
      },
    });

    // Create test register entries for credit account
    await db.registerEntry.createMany({
      data: [
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
      ],
    });

    // Run forecast
    const engine = ForecastEngineFactory.create(db);
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
    // Create test account register
    const accountRegister = await db.accountRegister.create({
      data: {
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
      },
    });

    // Create complex test register entries
    await db.registerEntry.createMany({
      data: [
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
      ],
    });

    // Run forecast
    const engine = ForecastEngineFactory.create(db);
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
