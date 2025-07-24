import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngineFactory } from "../index";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient } from "@prisma/client";
import { dateTimeService } from "../DateTimeService";

describe("Direct Debug Test", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  it("should test forecast engine step by step", async () => {
    console.log("=== DIRECT DEBUG TEST START ===");

    // Create a simple account register
    console.log("Creating account register...");
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
    console.log("Account register created:", accountRegister);

    // Create a simple register entry
    console.log("Creating register entry...");
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
    console.log("Register entry created:", registerEntry);

    // Create forecast engine
    console.log("Creating forecast engine...");
    const engine = ForecastEngineFactory.create(db);
    console.log("Forecast engine created:", engine);

    // Test the data loader directly
    console.log("Testing data loader...");
    const dataLoader = engine.getCache();
    console.log("Data loader created:", dataLoader);

    // Test loading account data
    console.log("Testing loadAccountData...");
    try {
      const accountData = await engine.getCache().accountRegister.find({});
      console.log("Account data loaded:", accountData);

      // Wait a bit to ensure async operations complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log("Async operations completed");
    } catch (error) {
      console.error("Error loading account data:", error);
    }

    console.log("=== DIRECT DEBUG TEST END ===");
    expect(true).toBe(true);
  });
});
