import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TransferService } from "../TransferService";
import { RegisterEntryService } from "../RegisterEntryService";
import { ModernCacheService } from "../ModernCacheService";
import { dateTimeService } from "../DateTimeService";
import { POCKET_TYPE_ID } from "~/consts";

vi.mock("../../logger", () => ({
  log: vi.fn(),
}));

function baseAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    typeId: 1,
    budgetId: 1,
    accountId: "acct-1",
    name: "Checking",
    balance: 1193.98,
    latestBalance: 1193.98,
    minPayment: null,
    statementAt: dateTimeService.create("2026-09-10").toDate(),
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
    subAccountRegisterId: null,
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
  };
}

function transferEntries(cache: ModernCacheService) {
  return cache.registerEntry.find({}).filter((e) => !e.isBalanceEntry);
}

function amountsFor(
  cache: ModernCacheService,
  accountRegisterId: number,
): number[] {
  return transferEntries(cache)
    .filter((e) => e.accountRegisterId === accountRegisterId)
    .map((e) => e.amount);
}

describe("TransferService pocket shortfall settlement", () => {
  let cache: ModernCacheService;
  let entryService: RegisterEntryService;
  let transfer: TransferService;
  const db = {} as PrismaClient;

  beforeEach(() => {
    cache = new ModernCacheService();
    cache.accountRegister.insert(
      baseAccount({ id: 1, name: "Novo MWC" }) as any,
    );
    entryService = new RegisterEntryService(db, cache);
    transfer = new TransferService(cache, entryService);
  });

  it("settles a negative pocket then posts the full scheduled transfer", () => {
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "RV Lot Rental",
        typeId: POCKET_TYPE_ID,
        subAccountRegisterId: 1,
        balance: -91.02,
        latestBalance: -91.02,
      }) as any,
    );

    transfer.transferBetweenAccounts({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 350,
      description: "RV Lot Rental (2026)",
    });

    expect(amountsFor(cache, 2)).toEqual([91.02, 350]);
    expect(amountsFor(cache, 1)).toEqual([-91.02, -350]);
    expect(cache.accountRegister.findById(2)?.balance).toBe(350);
    expect(cache.accountRegister.findById(1)?.balance).toBeCloseTo(
      1193.98 - 441.02,
      2,
    );

    const pocketEntries = transferEntries(cache).filter(
      (e) => e.accountRegisterId === 2,
    );
    expect(pocketEntries[0]!.description).toBe(
      "RV Lot Rental (2026) (shortfall settlement)",
    );
    expect(pocketEntries[1]!.description).toBe("RV Lot Rental (2026)");
    expect(
      transferEntries(cache).find(
        (e) =>
          e.accountRegisterId === 1 &&
          e.description.includes("shortfall settlement"),
      )?.description,
    ).toBe("Transfer for RV Lot Rental (2026) (shortfall settlement)");
  });

  it("still caps transfers into credit accounts and does not settle", () => {
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "Credit Card",
        typeId: 4,
        subAccountRegisterId: null,
        balance: -120,
        latestBalance: -120,
      }) as any,
    );

    transfer.transferBetweenAccounts({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 500,
      description: "Card payment",
    });

    expect(amountsFor(cache, 2)).toEqual([120]);
    expect(amountsFor(cache, 1)).toEqual([-120]);
    expect(cache.accountRegister.findById(2)?.balance).toBe(0);
  });

  it("does not settle a negative savings register that is not a pocket", () => {
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "Savings",
        typeId: 2,
        subAccountRegisterId: null,
        balance: -250,
        latestBalance: -250,
      }) as any,
    );

    transfer.transferBetweenAccounts({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 700,
      description: "Savings transfer",
    });

    expect(amountsFor(cache, 2)).toEqual([700]);
    expect(amountsFor(cache, 1)).toEqual([-700]);
    expect(cache.accountRegister.findById(2)?.balance).toBe(450);
  });

  it("treats a child register as a pocket even when typeId is not 15", () => {
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "Groceries",
        typeId: 1,
        subAccountRegisterId: 1,
        balance: -91.02,
        latestBalance: -91.02,
      }) as any,
    );

    transfer.transferBetweenAccounts({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 350,
      description: "Groceries",
    });

    expect(amountsFor(cache, 2)).toEqual([91.02, 350]);
    expect(amountsFor(cache, 1)).toEqual([-91.02, -350]);
    expect(cache.accountRegister.findById(2)?.balance).toBe(350);
  });

  it.each([
    { label: "zero", balance: 0 },
    { label: "positive", balance: 50 },
  ])("does not settle a $label pocket", ({ balance }) => {
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "Pocket",
        typeId: POCKET_TYPE_ID,
        subAccountRegisterId: 1,
        balance,
        latestBalance: balance,
      }) as any,
    );

    transfer.transferBetweenAccounts({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 350,
      description: "Pocket fill",
    });

    expect(amountsFor(cache, 2)).toEqual([350]);
    expect(amountsFor(cache, 1)).toEqual([-350]);
    expect(cache.accountRegister.findById(2)?.balance).toBe(balance + 350);
  });

  it("ignores pocket shortfall below money epsilon", () => {
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "Pocket",
        typeId: POCKET_TYPE_ID,
        subAccountRegisterId: 1,
        balance: -0.004,
        latestBalance: -0.004,
      }) as any,
    );

    transfer.transferBetweenAccounts({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 350,
      description: "Pocket fill",
    });

    expect(amountsFor(cache, 2)).toEqual([350]);
    expect(amountsFor(cache, 1)).toEqual([-350]);
  });

  it("does not settle when the scheduled transfer itself is below epsilon", () => {
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "Pocket",
        typeId: POCKET_TYPE_ID,
        subAccountRegisterId: 1,
        balance: -91.02,
        latestBalance: -91.02,
      }) as any,
    );

    transfer.transferBetweenAccounts({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 0.004,
      description: "Tiny transfer",
    });

    expect(transferEntries(cache)).toHaveLength(0);
    expect(cache.accountRegister.findById(2)?.balance).toBe(-91.02);
  });

  it("posts settlement then scheduled legs on transferBetweenAccountsWithDate", () => {
    cache.accountRegister.insert(
      baseAccount({
        id: 2,
        name: "RV Lot Rental",
        typeId: POCKET_TYPE_ID,
        subAccountRegisterId: 1,
        balance: -91.02,
        latestBalance: -91.02,
      }) as any,
    );

    const forecastDate = dateTimeService.create("2026-09-12").toDate();
    transfer.transferBetweenAccountsWithDate({
      targetAccountRegisterId: 2,
      sourceAccountRegisterId: 1,
      amount: 350,
      description: "RV Lot Rental (2026)",
      forecastDate,
    });

    const entries = transferEntries(cache);
    expect(entries).toHaveLength(4);
    for (const entry of entries) {
      expect(dateTimeService.format("YYYY-MM-DD", entry.createdAt)).toBe(
        "2026-09-12",
      );
    }
    expect(amountsFor(cache, 2)).toEqual([91.02, 350]);
    expect(amountsFor(cache, 1)).toEqual([-91.02, -350]);
    expect(cache.accountRegister.findById(2)?.balance).toBe(350);
  });
});
