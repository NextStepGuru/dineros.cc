import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngine } from "../ForecastEngine";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import { dateTimeService } from "../DateTimeService";
import { POCKET_TYPE_ID } from "~/consts";

describe("pocket shortfall forecast regression", () => {
  let db: any;
  let engine: ForecastEngine;
  const accountId = "pocket-shortfall-account";

  beforeEach(async () => {
    db = await createTestDatabase();
    engine = new ForecastEngine(db);
    dateTimeService.setNowOverride("2026-09-10T12:00:00.000Z");
  });

  afterEach(async () => {
    dateTimeService.clearNowOverride();
    await cleanupTestDatabase(db);
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
      statementAt: new Date("2026-10-01T00:00:00.000Z"),
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
      subAccountRegisterId: null,
      ...overrides,
    };
  }

  it("posts shortfall settlement plus the full weekly pocket transfer on the first occurrence", async () => {
    const checking = await db.accountRegister.create({
      data: account({
        id: 1,
        name: "Novo MWC",
        balance: 1193.98,
        latestBalance: 1193.98,
      }),
    });
    const pocket = await db.accountRegister.create({
      data: account({
        id: 2,
        name: "RV Lot Rental",
        typeId: POCKET_TYPE_ID,
        subAccountRegisterId: checking.id,
        balance: -91.02,
        latestBalance: -91.02,
      }),
    });

    await db.reoccurrence.create({
      data: {
        accountId,
        accountRegisterId: checking.id,
        transferAccountRegisterId: pocket.id,
        description: "RV Lot Rental (2026)",
        amount: -350,
        intervalId: 2,
        intervalCount: 1,
        lastAt: new Date("2026-09-05T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await engine.recalculate({
      accountId,
      startDate: new Date("2026-09-10T00:00:00.000Z"),
      endDate: new Date("2026-10-10T00:00:00.000Z"),
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    const transferEntries = result.registerEntries.filter(
      (entry) =>
        !entry.isBalanceEntry &&
        entry.reoccurrenceId != null &&
        (entry.description.includes("RV Lot Rental (2026)") ||
          Boolean(entry.sourceAccountRegisterId)),
    );

    const byDate = new Map<string, typeof transferEntries>();
    for (const entry of transferEntries) {
      const key = String(entry.createdAt).slice(0, 10);
      const list = byDate.get(key) ?? [];
      list.push(entry);
      byDate.set(key, list);
    }

    const firstDay = byDate.get("2026-09-12") ?? [];
    const pocketFirst = firstDay
      .filter((e) => e.accountRegisterId === pocket.id)
      .map((e) => e.amount)
      .sort((a, b) => a - b);
    const checkingFirst = firstDay
      .filter((e) => e.accountRegisterId === checking.id)
      .map((e) => e.amount)
      .sort((a, b) => a - b);

    expect(pocketFirst).toEqual([91.02, 350]);
    expect(checkingFirst).toEqual([-350, -91.02]);
    expect(
      checkingFirst.reduce((sum, amount) => sum + amount, 0),
    ).toBeCloseTo(-441.02, 2);

    const laterDates = [...byDate.keys()]
      .filter((key) => key > "2026-09-12")
      .sort();
    expect(laterDates.length).toBeGreaterThan(0);
    for (const key of laterDates) {
      const day = byDate.get(key) ?? [];
      expect(
        day
          .filter((e) => e.accountRegisterId === pocket.id)
          .map((e) => e.amount),
      ).toEqual([350]);
      expect(
        day
          .filter((e) => e.accountRegisterId === checking.id)
          .map((e) => e.amount),
      ).toEqual([-350]);
    }
  });
});
