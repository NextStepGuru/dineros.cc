/**
 * 3-month forecast golden scenario: checking + loan + savings, user reoccurrences,
 * loan interest + min-payment transfers. Inclusive endDate (see datesProcessed assert).
 *
 * Run: TZ=UTC pnpm exec vitest run --config vitest.config.all.ts server/services/forecast/__tests__/threeMonthLoanAndReoccurrence.forecast.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngine } from "../ForecastEngine";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import { dateTimeService } from "../DateTimeService";
import type { RegisterEntry } from "~/types/types";

const ACCOUNT_ID = "three-month-loan-recurrence-account";

/** Round for stable snapshots / float compares */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeForSnapshot(entries: RegisterEntry[]) {
  return [...entries]
    .sort((a, b) => {
      const c = a.createdAt.localeCompare(b.createdAt);
      if (c !== 0) return c;
      if (a.accountRegisterId !== b.accountRegisterId) {
        return a.accountRegisterId - b.accountRegisterId;
      }
      return a.description.localeCompare(b.description);
    })
    .map((e) => ({
      date: e.createdAt.slice(0, 10),
      accountRegisterId: e.accountRegisterId,
      typeId: e.typeId,
      description: e.description,
      amount: r2(Number(e.amount)),
      balance: r2(Number(e.balance)),
      reoccurrenceId: e.reoccurrenceId ?? null,
      sourceAccountRegisterId: e.sourceAccountRegisterId ?? null,
      isBalanceEntry: e.isBalanceEntry,
      isProjected: e.isProjected,
    }));
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
    ...overrides,
  };
}

function assertBalanceRows(entries: RegisterEntry[]) {
  const balanceRows = entries.filter((e) => e.isBalanceEntry);
  expect(balanceRows).toHaveLength(3);
  const balAmounts = balanceRows
    .map((e) => Number(e.amount))
    .sort((a, b) => a - b);
  // Synthetic row amounts match account_register latest_balance (loan negative, savings zero, checking positive)
  expect(balAmounts).toEqual([-8000, 0, 50000]);
}

function assertRecurringEntries(
  entries: RegisterEntry[],
  checkingId: number,
  savingsId: number,
) {
  const salary = entries.filter(
    (e) =>
      e.description === "Golden Salary" && e.accountRegisterId === checkingId,
  );
  const rent = entries.filter(
    (e) =>
      e.description === "Golden Rent" && e.accountRegisterId === checkingId,
  );
  const xferOut = entries.filter(
    (e) =>
      e.accountRegisterId === checkingId &&
      e.typeId === 6 &&
      e.description?.includes("Golden Savings xfer") &&
      Number(e.amount) === -150,
  );
  const xferIn = entries.filter(
    (e) =>
      e.accountRegisterId === savingsId &&
      e.description === "Golden Savings xfer" &&
      Number(e.amount) === 150,
  );

  expect(salary.length).toBe(3);
  expect(rent.length).toBe(3);
  expect(xferOut.length).toBe(3);
  expect(xferIn.length).toBe(3);
  expect(
    salary.every((e) => e.amount === 3_000 && e.reoccurrenceId != null),
  ).toBe(true);
}

function assertLoanEntries(
  entries: RegisterEntry[],
  loanId: number,
  checkingId: number,
) {
  const interestOnLoan = entries.filter(
    (e) =>
      e.accountRegisterId === loanId &&
      e.description === "Interest Charge" &&
      e.typeId === 2,
  );
  expect(interestOnLoan.length).toBeGreaterThanOrEqual(1);
  const firstInterest = interestOnLoan[0];
  if (!firstInterest)
    throw new Error("Expected at least one loan interest entry");
  expect(firstInterest.amount).toBeCloseTo(-39.55, 2);

  const type6Pairs = entries.filter(
    (e) =>
      e.typeId === 6 &&
      ((e.accountRegisterId === loanId &&
        e.sourceAccountRegisterId === checkingId) ||
        (e.accountRegisterId === checkingId &&
          e.sourceAccountRegisterId === loanId)),
  );
  expect(type6Pairs.length).toBeGreaterThanOrEqual(2);
  expect(
    type6Pairs.every((e) => e.reoccurrenceId == null || e.reoccurrenceId !== 0),
  ).toBe(true);

  const paymentToLoan = entries.filter(
    (e) =>
      e.typeId === 6 &&
      e.accountRegisterId === loanId &&
      e.description.includes("Payment to"),
  );
  const transferForPayment = entries.filter(
    (e) =>
      e.typeId === 6 &&
      e.accountRegisterId === checkingId &&
      e.description.includes("Transfer for Payment"),
  );
  expect(paymentToLoan.length).toBeGreaterThanOrEqual(1);
  expect(transferForPayment.length).toBeGreaterThanOrEqual(1);
  const firstPaymentToLoan = paymentToLoan[0];
  if (!firstPaymentToLoan) {
    throw new Error("Expected at least one payment-to-loan entry");
  }
  expect(firstPaymentToLoan.amount).toBeCloseTo(119.91, 2);
}

function assertType6DailyZeroSum(entries: RegisterEntry[]) {
  const type6ByDay = new Map<string, number>();
  for (const e of entries.filter((x) => x.typeId === 6)) {
    const d = e.createdAt.slice(0, 10);
    type6ByDay.set(d, (type6ByDay.get(d) ?? 0) + Number(e.amount));
  }
  for (const sum of type6ByDay.values()) {
    expect(Math.abs(r2(sum))).toBeLessThanOrEqual(0.02);
  }
}

function assertRunningBalances(
  entries: RegisterEntry[],
  registerIds: number[],
) {
  const byReg = (id: number) =>
    entries.filter((e) => e.accountRegisterId === id);
  for (const regId of registerIds) {
    const sorted = byReg(regId).sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let prev: (typeof sorted)[number] | undefined;
    for (const row of sorted) {
      if (row.isBalanceEntry) {
        expect(row.balance).toBe(row.amount);
        prev = row;
        continue;
      }
      if (prev) {
        expect(r2(Number(row.balance))).toBe(
          r2(Number(prev.balance) + Number(row.amount)),
        );
      }
      prev = row;
    }
  }
}

function assertFinalBalanceConsistency(
  entries: RegisterEntry[],
  registerIds: number[],
) {
  const byReg = (id: number) =>
    entries.filter((e) => e.accountRegisterId === id);
  for (const regId of registerIds) {
    const sorted = byReg(regId).sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const balEntry = sorted.find((e) => e.isBalanceEntry);
    expect(balEntry).toBeDefined();
    if (!balEntry) throw new Error("Expected balance entry");
    const opening = Number(balEntry.amount);
    const nonBal = sorted.filter((e) => !e.isBalanceEntry);
    const sumAmt = nonBal.reduce((s, e) => s + Number(e.amount), 0);
    const last = sorted.at(-1);
    expect(last).toBeDefined();
    if (!last) throw new Error("Expected at least one entry");
    expect(r2(Number(last.balance))).toBe(r2(opening + sumAmt));
  }
}

describe("threeMonthLoanAndReoccurrence forecast golden", () => {
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

  it("Feb–Apr 2024: loan payments, reoccurrences, running balances, snapshot", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const checkingPayload = {
      ...baseRegister({
        name: "Checking",
        typeId: 1,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
      balance: 50_000,
      latestBalance: 50_000,
    };
    const checking = await db.accountRegister.create({ data: checkingPayload });
    const loan = await db.accountRegister.create({
      data: baseRegister({
        name: "Test Loan",
        typeId: 5,
        balance: -8_000,
        latestBalance: -8_000,
        minPayment: 200,
        statementAt: new Date("2024-02-15T00:00:00.000Z"),
        apr1: 0.06,
        apr1StartAt: new Date("2020-01-01T00:00:00.000Z"),
        targetAccountRegisterId: checking.id,
        loanOriginalAmount: 20_000,
      }),
    });
    const savings = await db.accountRegister.create({
      data: baseRegister({
        name: "Savings",
        typeId: 1,
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    await db.reoccurrence.create({
      data: {
        accountId: ACCOUNT_ID,
        accountRegisterId: checking.id,
        description: "Golden Salary",
        amount: 3_000,
        intervalId: 3,
        intervalCount: 1,
        lastAt: new Date("2024-01-01T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });
    await db.reoccurrence.create({
      data: {
        accountId: ACCOUNT_ID,
        accountRegisterId: checking.id,
        description: "Golden Rent",
        amount: -800,
        intervalId: 3,
        intervalCount: 1,
        lastAt: new Date("2024-01-05T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });
    await db.reoccurrence.create({
      data: {
        accountId: ACCOUNT_ID,
        accountRegisterId: checking.id,
        transferAccountRegisterId: savings.id,
        description: "Golden Savings xfer",
        amount: -150,
        intervalId: 3,
        intervalCount: 1,
        lastAt: new Date("2024-01-10T00:00:00.000Z"),
        endAt: null,
        adjustBeforeIfOnWeekend: false,
      },
    });

    // Inclusive end: Feb 1 through Apr 30, 2024 (leap year) = 29 + 31 + 30 days
    const startDate = new Date("2024-02-01T00:00:00.000Z");
    const endDate = new Date("2024-04-30T00:00:00.000Z");

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);
    expect(result.errors).toBeUndefined();

    const days =
      29 + 31 + 30; /* Feb 2024 (leap) + Mar + Apr, inclusive Feb 1 .. Apr 30 */
    expect(result.datesProcessed).toBe(days);

    const entries = result.registerEntries;

    assertBalanceRows(entries);
    assertRecurringEntries(entries, checking.id, savings.id);
    assertLoanEntries(entries, loan.id, checking.id);
    assertType6DailyZeroSum(entries);
    assertRunningBalances(entries, [checking.id, loan.id, savings.id]);
    assertFinalBalanceConsistency(entries, [checking.id, loan.id, savings.id]);

    expect(normalizeForSnapshot(entries)).toMatchSnapshot();
  });
});
