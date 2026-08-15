/**
 * Multi-year (12-month, leap year) golden ledger assertions:
 * month-end bill anchor, whole-cent amounts, opening + sum === final balance.
 *
 * Run: TZ=UTC pnpm exec vitest run --config vitest.config.ts server/services/forecast/__tests__/multiYearLedger.golden.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngine } from "../ForecastEngine";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import { dateTimeService } from "../DateTimeService";
import type { RegisterEntry } from "~/types/types";

const ACCOUNT_ID = "multi-year-ledger-account";

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isWholeCent(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
}

function baseRegister(overrides: Record<string, unknown>) {
  return {
    budgetId: 1,
    accountId: ACCOUNT_ID,
    statementIntervalId: 3,
    minPayment: null,
    apr1: null,
    apr1StartAt: null,
    apr2: null,
    apr2StartAt: null,
    apr3: null,
    apr3StartAt: null,
    targetAccountRegisterId: null,
    loanStartAt: null,
    loanPaymentsPerYear: 12,
    loanTotalYears: 30,
    loanOriginalAmount: null,
    loanPaymentSortOrder: 1,
    savingsGoalSortOrder: 0,
    accountSavingsGoal: null,
    minAccountBalance: 0,
    allowExtraPayment: false,
    isArchived: false,
    plaidId: null,
    depreciationRate: null,
    depreciationMethod: null,
    assetOriginalValue: null,
    assetResidualValue: null,
    assetUsefulLifeYears: null,
    assetStartAt: null,
    ...overrides,
  };
}

function assertOpeningPlusSumEqualsFinal(
  entries: RegisterEntry[],
  registerId: number,
) {
  const forReg = entries.filter((e) => e.accountRegisterId === registerId);
  const balanceRow = forReg.find((e) => e.isBalanceEntry);
  expect(balanceRow).toBeDefined();
  const opening = Number(balanceRow!.amount);
  const nonBalance = forReg.filter((e) => !e.isBalanceEntry);
  const sum = nonBalance.reduce((s, e) => s + Number(e.amount), 0);
  const last = [...forReg].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      (a.seq ?? 0) - (b.seq ?? 0),
  ).at(-1);
  expect(last).toBeDefined();
  expect(r2(Number(last!.balance))).toBe(r2(opening + sum));
}

describe("multi-year ledger golden", () => {
  let db: any;
  let engine: ForecastEngine;

  beforeEach(async () => {
    db = await createTestDatabase();
    engine = new ForecastEngine(db);
  });

  afterEach(async () => {
    await cleanupTestDatabase(db);
    dateTimeService.clearNowOverride();
  });

  it("12 months across leap year: month-end bill, whole cents, balance continuity", async () => {
    dateTimeService.setNowOverride("2024-01-15T12:00:00.000Z");

    const checking = await db.accountRegister.create({
      data: baseRegister({
        name: "Checking",
        typeId: 1,
        balance: 10_000,
        latestBalance: 10_000,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const vehicle = await db.accountRegister.create({
      data: baseRegister({
        name: "Vehicle",
        typeId: 20,
        balance: 5_000,
        latestBalance: 5_000,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        statementIntervalId: 3,
        depreciationRate: 0.12,
        depreciationMethod: "compound",
        assetOriginalValue: 5_000,
        assetResidualValue: 4_000,
        assetUsefulLifeYears: 5,
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const billAnchor = new Date("2023-12-31T00:00:00.000Z");
    await db.reoccurrence.create({
      data: {
        accountId: ACCOUNT_ID,
        accountRegisterId: checking.id,
        description: "Month-end bill",
        amount: -100,
        intervalId: 3,
        intervalCount: 1,
        lastAt: billAnchor,
        scheduleAnchorAt: billAnchor,
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate: new Date("2024-01-01T00:00:00.000Z"),
      endDate: new Date("2024-12-31T00:00:00.000Z"),
    });

    expect(result.isSuccess).toBe(true);
    const entries = result.registerEntries;

    for (const e of entries) {
      expect(isWholeCent(Number(e.amount))).toBe(true);
      expect(isWholeCent(Number(e.balance))).toBe(true);
    }

    const billDates = entries
      .filter((e) => e.description === "Month-end bill")
      .map((e) => e.createdAt.slice(0, 10))
      .sort();
    expect(billDates).toContain("2024-01-31");
    expect(billDates).toContain("2024-02-29");
    expect(billDates).toContain("2024-03-31");
    expect(billDates).toContain("2024-04-30");
    expect(billDates).toContain("2024-05-31");

    assertOpeningPlusSumEqualsFinal(entries, checking.id);
    assertOpeningPlusSumEqualsFinal(entries, vehicle.id);

    expect(normalizeForSnapshot(entries)).toMatchSnapshot();
  });
});

function normalizeForSnapshot(entries: RegisterEntry[]) {
  return [...entries]
    .sort((a, b) => {
      const c = a.createdAt.localeCompare(b.createdAt);
      if (c !== 0) return c;
      if (a.accountRegisterId !== b.accountRegisterId) {
        return a.accountRegisterId - b.accountRegisterId;
      }
      return (a.description ?? "").localeCompare(b.description ?? "");
    })
    .map((e) => ({
      date: e.createdAt.slice(0, 10),
      accountRegisterId: e.accountRegisterId,
      typeId: e.typeId,
      description: e.description,
      amount: r2(Number(e.amount)),
      balance: r2(Number(e.balance)),
      isBalanceEntry: e.isBalanceEntry,
      isProjected: e.isProjected,
    }));
}
