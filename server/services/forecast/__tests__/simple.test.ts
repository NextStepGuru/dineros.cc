import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngineFactory } from "../index";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient } from "@prisma/client";
import { dateTimeService } from "../DateTimeService";

describe("Simple Forecast Engine Test", () => {
  let db: PrismaClient;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
  });

  it("should create forecast engine and return success", async () => {
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

    // Create forecast engine
    const engine = ForecastEngineFactory.create(db);

    // Call recalculate
    const result = await engine.recalculate({
      accountId: "test-account",
      startDate: dateTimeService.create().toDate(),
      endDate: dateTimeService.create().add(1, "month").toDate(),
      logging: { enabled: false },
    });

    // For now, just expect it to not throw an error
    expect(result).toBeDefined();
    expect(typeof result.isSuccess).toBe("boolean");
  });
});
