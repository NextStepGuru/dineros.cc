import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ForecastEngine } from "../ForecastEngine";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import { dateTimeService } from "../DateTimeService";

describe("Reoccurrence + Forecast integration", () => {
  let db: any;
  let engine: ForecastEngine;
  const accountId = "recurrence-integration-account";

  beforeEach(async () => {
    db = await createTestDatabase();
    engine = new ForecastEngine(db);
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
    vi.restoreAllMocks();
  });

  function account(overrides: Record<string, any>) {
    return {
      budgetId: 1,
      accountId,
      name: "Account",
      typeId: 1,
      balance: 0,
      latestBalance: 0,
      minPayment: null,
      statementAt: new Date("2024-02-01T00:00:00.000Z"),
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
      ...overrides,
    };
  }

  async function runForecast(startDate: string, endDate: string) {
    return engine.recalculate({
      accountId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      logging: { enabled: false },
    });
  }

  it("generates weekly transfer recurrence entries with correct signs", async () => {
    const checking = await db.accountRegister.create({
      data: account({ id: 1, name: "Checking", balance: 3000, latestBalance: 3000 }),
    });
    const groceries = await db.accountRegister.create({
      data: account({ id: 2, name: "Groceries", balance: 0, latestBalance: 0 }),
    });

    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        transferAccountRegisterId: groceries.id,
        description: "Groceries Transfer",
        amount: -500,
        intervalId: 2,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await runForecast("2024-01-01", "2024-01-29");

    expect(result.isSuccess).toBe(true);
    const transferEntries = result.registerEntries.filter(
      (entry) => entry.reoccurrenceId != null && entry.description.includes("Groceries Transfer"),
    );
    const checkingEntries = transferEntries.filter(
      (entry) => entry.accountRegisterId === checking.id && entry.amount === -500,
    );
    const groceriesEntries = transferEntries.filter(
      (entry) => entry.accountRegisterId === groceries.id && entry.amount === 500,
    );
    expect(checkingEntries.length).toBe(4);
    expect(groceriesEntries.length).toBe(4);
  });

  it("generates monthly non-transfer recurrence entries across range", async () => {
    const checking = await db.accountRegister.create({
      data: account({ id: 11, name: "Checking", balance: 1000, latestBalance: 1000 }),
    });

    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        description: "Monthly Bonus",
        amount: 100,
        intervalId: 3,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await runForecast("2024-01-01", "2024-04-01");

    expect(result.isSuccess).toBe(true);
    const monthly = result.registerEntries.filter(
      (entry) => entry.description === "Monthly Bonus" && entry.accountRegisterId === checking.id,
    );
    expect(monthly.length).toBe(3);
    expect(monthly.every((entry) => entry.amount === 100)).toBe(true);
  });

  it("processes mixed transfer and non-transfer recurrences due same day", async () => {
    const checking = await db.accountRegister.create({
      data: account({ id: 21, name: "Checking", balance: 2000, latestBalance: 2000 }),
    });
    const savings = await db.accountRegister.create({
      data: account({ id: 22, name: "Savings", balance: 0, latestBalance: 0 }),
    });

    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        transferAccountRegisterId: savings.id,
        description: "Weekly Transfer",
        amount: -50,
        intervalId: 2,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });
    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        description: "Weekly Expense",
        amount: -25,
        intervalId: 2,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await runForecast("2024-01-01", "2024-01-08");

    expect(result.isSuccess).toBe(true);
    expect(
      result.registerEntries.some((entry) => entry.description.includes("Weekly Transfer")),
    ).toBe(true);
    expect(result.registerEntries.some((entry) => entry.description === "Weekly Expense")).toBe(true);
  });

  it("stops generating entries at endAt boundary", async () => {
    const checking = await db.accountRegister.create({
      data: account({ id: 31, name: "Checking", balance: 1000, latestBalance: 1000 }),
    });
    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        description: "Bounded Weekly",
        amount: 40,
        intervalId: 2,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: new Date("2024-01-15T00:00:00.000Z"),
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await runForecast("2024-01-01", "2024-01-29");

    expect(result.isSuccess).toBe(true);
    const bounded = result.registerEntries.filter((entry) => entry.description === "Bounded Weekly");
    expect(bounded.length).toBe(2);
  });

  it("does not generate entries for once recurrence", async () => {
    const checking = await db.accountRegister.create({
      data: account({ id: 41, name: "Checking", balance: 1200, latestBalance: 1200 }),
    });
    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        description: "One Time",
        amount: 900,
        intervalId: 5,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });
    const originalFindMany = db.reoccurrence.findMany.getMockImplementation();
    db.reoccurrence.findMany.mockImplementation(async ({ where }: any) => {
      const rows = await Promise.resolve(originalFindMany({ where }));
      return rows.map((row: any) => {
        if (row.description === "One Time") {
          return { ...row, interval: { name: "once" } };
        }
        return row;
      });
    });

    const result = await runForecast("2024-01-01", "2024-01-31");

    expect(result.isSuccess).toBe(true);
    const onceEntries = result.registerEntries.filter((entry) => entry.description === "One Time");
    expect(onceEntries.length).toBe(0);
  });

  it("skips transfer recurrence when debt source account is paid off", async () => {
    const debt = await db.accountRegister.create({
      data: account({ id: 51, name: "Debt", typeId: 3, balance: 0, latestBalance: 0 }),
    });
    const checking = await db.accountRegister.create({
      data: account({ id: 52, name: "Checking", balance: 2000, latestBalance: 2000 }),
    });

    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: debt.id,
        transferAccountRegisterId: checking.id,
        description: "Debt autopay",
        amount: 100,
        intervalId: 2,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await runForecast("2024-01-01", "2024-01-08");

    expect(result.isSuccess).toBe(true);
    const debtAutopayEntries = result.registerEntries.filter(
      (entry) => entry.description.includes("Debt autopay"),
    );
    expect(debtAutopayEntries.length).toBe(0);
  });

  it("caps transfer recurrence amount to debt balance", async () => {
    const debt = await db.accountRegister.create({
      data: account({ id: 61, name: "Debt", typeId: 3, balance: -120, latestBalance: -120 }),
    });
    const checking = await db.accountRegister.create({
      data: account({ id: 62, name: "Checking", balance: 2000, latestBalance: 2000 }),
    });

    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: debt.id,
        transferAccountRegisterId: checking.id,
        description: "Debt capped",
        amount: 500,
        intervalId: 2,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await runForecast("2024-01-01", "2024-01-08");

    expect(result.isSuccess).toBe(true);
    const debtSideEntries = result.registerEntries.filter(
      (entry) =>
        entry.accountRegisterId === debt.id &&
        entry.description.includes("Debt capped"),
    );
    expect(debtSideEntries.length).toBeGreaterThan(0);
    expect(debtSideEntries.some((entry) => Math.abs(entry.amount) === 120)).toBe(true);
  });

  it("uses adjusted friday date for weekend transfer recurrences", async () => {
    const checking = await db.accountRegister.create({
      data: account({ id: 71, name: "Checking", balance: 1500, latestBalance: 1500 }),
    });
    const target = await db.accountRegister.create({
      data: account({ id: 72, name: "Target", balance: 0, latestBalance: 0 }),
    });
    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        transferAccountRegisterId: target.id,
        description: "Weekend transfer",
        amount: -100,
        intervalId: 1,
        intervalCount: 1,
        lastAt: new Date("2024-01-06T00:00:00.000Z"), // next is Sunday
        endAt: null,
        adjustBeforeIfOnWeekend: true,
      },
    });

    const result = await runForecast("2024-01-06", "2024-01-07");

    expect(result.isSuccess).toBe(true);
    const targetEntry = result.registerEntries.find(
      (entry) => entry.description === "Weekend transfer" && entry.accountRegisterId === target.id,
    );
    expect(targetEntry).toBeDefined();
    const created = dateTimeService.createUTC(targetEntry!.createdAt);
    expect(created.day()).toBe(5); // Friday
  });

  it("handles month-end monthly recurrence dates across six months", async () => {
    const checking = await db.accountRegister.create({
      data: account({ id: 81, name: "Month End", balance: 3000, latestBalance: 3000 }),
    });

    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        description: "Month End Pay",
        amount: 100,
        intervalId: 3,
        intervalCount: 1,
        lastAt: new Date("2024-01-31T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await runForecast("2024-01-31", "2024-07-31");

    expect(result.isSuccess).toBe(true);
    const dates = result.registerEntries
      .filter(
        (entry) =>
          entry.accountRegisterId === checking.id &&
          entry.description === "Month End Pay",
      )
      .map((entry) => entry.createdAt.slice(0, 10))
      .sort();

    expect(dates).toEqual([
      "2024-02-29",
      "2024-03-29",
      "2024-04-29",
      "2024-05-29",
      "2024-06-29",
      "2024-07-29",
    ]);
  });

  it("applies weekend adjustment at month boundary (Saturday March 1 -> Friday Feb 28)", async () => {
    const checking = await db.accountRegister.create({
      data: account({ id: 91, name: "Checking", balance: 1500, latestBalance: 1500 }),
    });

    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        description: "Boundary Weekend",
        amount: -75,
        intervalId: 2,
        intervalCount: 1,
        lastAt: new Date("2025-02-22T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: true,
      },
    });

    const result = await runForecast("2025-02-22", "2025-03-01");

    expect(result.isSuccess).toBe(true);
    const entry = result.registerEntries.find(
      (row) =>
        row.accountRegisterId === checking.id &&
        row.description === "Boundary Weekend",
    );
    expect(entry).toBeDefined();
    const created = dateTimeService.createUTC(entry!.createdAt);
    expect(created.day()).toBe(5);
    expect(created.format("YYYY-MM-DD")).toBe("2025-02-28");
  });

  it("returns zero timeline processing when startDate is after endDate", async () => {
    await db.accountRegister.create({
      data: account({ id: 101, name: "Range Account", balance: 1000, latestBalance: 1000 }),
    });

    const result = await runForecast("2025-03-10", "2025-03-01");

    expect(result.isSuccess).toBe(true);
    expect(result.datesProcessed).toBe(0);
  });

  it("accepts exactly 10-year forecast range", async () => {
    await db.accountRegister.create({
      data: account({ id: 102, name: "10y Account", balance: 1000, latestBalance: 1000 }),
    });

    const result = await runForecast("2024-01-01", "2034-01-01");

    expect(result.isSuccess).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("keeps current behavior for 10 years + 1 day range", async () => {
    await db.accountRegister.create({
      data: account({ id: 103, name: "10y+1d Account", balance: 1000, latestBalance: 1000 }),
    });

    const result = await runForecast("2024-01-01", "2034-01-02");

    expect(result.isSuccess).toBe(true);
    expect(result.errors).toBeUndefined();
  });
});
