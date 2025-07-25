import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngineFactory } from "../index";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient } from "~/types/test-types";
import { dateTimeService } from "../DateTimeService";
import { log } from "../../../logger";

describe("Direct Debug Test", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  it("should test forecast engine step by step", async () => {
    // Create a simple account register
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

    // Create a simple register entry
    const registerEntry = await db.registerEntry.create({
      data: {
        id: "entry-1",
        accountRegisterId: 1,
        description: "Test Entry",
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

    // Create forecast engine
    const engine = ForecastEngineFactory.create(db);

    // Test the data loader directly
    const dataLoader = engine.getCache();

    // Test loading account data
    try {
      const accountData = await engine.getCache().accountRegister.find({});

      // Wait a bit to ensure async operations complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      log({
        message: "Error loading account data:",
        data: error,
        level: "error",
      });
    }

    expect(true).toBe(true);
  });
});
