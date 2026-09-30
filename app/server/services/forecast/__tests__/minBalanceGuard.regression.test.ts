import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { TransferService } from "../TransferService";
import { MinBalanceGuardService } from "../MinBalanceGuardService";
import { ModernCacheService } from "../ModernCacheService";
import type {
  CacheAccountRegister,
  CacheRegisterEntry,
} from "../ModernCacheService";
import type { RegisterEntryService } from "../RegisterEntryService";
import { forecastLogger } from "../logger";
import { dateTimeService } from "../DateTimeService";
import { ForecastEngineFactory } from "../index";

/** Half-cent tolerance matching the services' MONEY_EPSILON. */
const EPS = 0.005;

function makeAccount(overrides: Partial<CacheAccountRegister>): CacheAccountRegister {
  return {
    id: 1,
    subAccountRegisterId: null,
    typeId: 1,
    budgetId: 1,
    accountId: "test-account",
    name: "Test Account",
    balance: 0,
    latestBalance: 0,
    minPayment: null,
    statementAt: dateTimeService.create("2026-01-01").toDate(),
    statementIntervalId: 3,
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

function makeEntry(overrides: Partial<CacheRegisterEntry>): CacheRegisterEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2)}`,
    seq: null,
    accountRegisterId: 1,
    sourceAccountRegisterId: null,
    createdAt: dateTimeService.create("2026-10-01").toDate(),
    description: "Test Entry",
    reoccurrenceId: null,
    amount: 0,
    balance: 0,
    typeId: 6,
    isBalanceEntry: false,
    isPending: false,
    isCleared: false,
    isProjected: true,
    isManualEntry: false,
    isReconciled: false,
    categoryId: null,
    ...overrides,
  };
}

/** Walks the post-anchor display chain (anchor + manual/projected rows) and returns running balances. */
function computeDisplayChainBalances(
  cache: ModernCacheService,
  accountRegisterId: number,
): number[] {
  const account = cache.accountRegister.findOne({ id: accountRegisterId })!;
  const entries = cache.registerEntry.find({ accountRegisterId });
  let anchor: number | null = null;
  const chain: CacheRegisterEntry[] = [];
  for (const entry of entries) {
    if (entry.isBalanceEntry) {
      anchor = +entry.amount;
      continue;
    }
    if (entry.isCleared) continue;
    if (!entry.isManualEntry && !entry.isProjected) continue;
    chain.push(entry);
  }
  chain.sort((a, b) => {
    const aTime = dateTimeService.toDate(a.createdAt).getTime();
    const bTime = dateTimeService.toDate(b.createdAt).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return +b.amount - +a.amount;
  });
  let running = anchor ?? +account.latestBalance;
  return chain.map((entry) => {
    running = Math.round((running + entry.amount) * 100) / 100;
    return running;
  });
}

/**
 * Reproduces the exact ledger from the reported bug: Novo MWC (register 1,
 * min balance $10,000) showed a projected "Debt Payment to GM Financial" of
 * −$2,846.00 on 2026-10-01 dropping the balance to $8,107.07.
 */
describe("MinBalanceGuard regression", () => {
  let cache: ModernCacheService;
  let guard: MinBalanceGuardService;

  const NOVO_BALANCE = 12771.64;
  const FLOOR = 10000;

  function seedScreenshotLedger(paymentAmount: number) {
    cache.accountRegister.insert(
      makeAccount({
        id: 1,
        name: "Novo MWC",
        balance: NOVO_BALANCE,
        latestBalance: NOVO_BALANCE,
        minAccountBalance: FLOOR,
        allowExtraPayment: true,
      }),
    );
    cache.accountRegister.insert(
      makeAccount({
        id: 8,
        name: "GM Financial",
        typeId: 5,
        balance: -25432.07,
        latestBalance: -25432.07,
      }),
    );

    const d = (input: string) => dateTimeService.create(input).toDate();

    cache.registerEntry.insert(
      makeEntry({
        id: "bal-1",
        accountRegisterId: 1,
        amount: NOVO_BALANCE,
        isBalanceEntry: true,
        createdAt: d("2026-09-30T23:59:59Z"),
      }),
    );
    // Real pending/manual activity that has not cleared yet (shown pre-anchor).
    cache.registerEntry.insert(
      makeEntry({
        id: "e-goodsam",
        accountRegisterId: 1,
        description: "Good Sam RV / Roamly Insurance",
        amount: -234,
        isManualEntry: true,
        isProjected: false,
        createdAt: d("2026-09-16T00:00:00Z"),
      }),
    );
    // Projected September 30 debits.
    for (const [id, amount, day] of [
      ["e-netflix", -30.57, "2026-09-30"],
      ["e-cursor", -200, "2026-09-30"],
      ["e-lively", -450, "2026-09-30"],
    ] as const) {
      cache.registerEntry.insert(
        makeEntry({
          id,
          accountRegisterId: 1,
          amount,
          createdAt: d(`${day}T00:00:00Z`),
        }),
      );
    }
    // Projected October 1 debits + the oversized extra debt payment.
    for (const [id, amount] of [
      ["e-gapps", -115],
      ["e-gcloud", -189],
      ["e-groceries", -600],
    ] as const) {
      cache.registerEntry.insert(
        makeEntry({
          id,
          accountRegisterId: 1,
          amount,
          createdAt: d("2026-10-01T00:00:00Z"),
        }),
      );
    }
    cache.registerEntry.insert(
      makeEntry({
        id: "leg-src-1",
        accountRegisterId: 1,
        description: "Debt Payment to GM Financial",
        sourceAccountRegisterId: 8,
        amount: -paymentAmount,
        createdAt: d("2026-10-01T00:00:00Z"),
      }),
    );
    // Early-October bills that post AFTER the payment.
    for (const [id, amount] of [
      ["e-aws", -1.81],
      ["e-rvmail", -39.95],
      ["e-vineo", -42],
    ] as const) {
      cache.registerEntry.insert(
        makeEntry({
          id,
          accountRegisterId: 1,
          amount,
          createdAt: d("2026-10-02T00:00:00Z"),
        }),
      );
    }
    // Mirrored credit leg on the debt register.
    cache.registerEntry.insert(
      makeEntry({
        id: "leg-debt-1",
        accountRegisterId: 8,
        description: "Extra debt payment from Novo MWC",
        sourceAccountRegisterId: 1,
        amount: paymentAmount,
        createdAt: d("2026-10-01T00:00:00Z"),
      }),
    );
  }

  beforeEach(() => {
    cache = new ModernCacheService();
    guard = new MinBalanceGuardService(cache);
    vi.spyOn(forecastLogger, "service").mockImplementation(() => {});
    vi.spyOn(forecastLogger, "serviceDebug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("trims the 2026-10-01 debt payment so the ledger never drops below the $10k floor", () => {
    seedScreenshotLedger(2846);

    guard.enforceFloors({
      accountRegisterIds: [1, 8],
      extraDebtPaymentLegs: [
        {
          sourceEntryId: "leg-src-1",
          debtEntryId: "leg-debt-1",
          sourceAccountRegisterId: 1,
          debtAccountRegisterId: 8,
        },
      ],
    });

    const sourceLeg = cache.registerEntry.findById("leg-src-1")!;
    const debtLeg = cache.registerEntry.findById("leg-debt-1")!;
    // Pre-payment chain: 12,771.64 − 234 − 30.57 − 200 − 450 − 115 − 189 − 600
    // = 10,953.07. Later bills total −83.76, so the largest payment that keeps
    // every later balance ≥ 10,000 is 10,953.07 − 83.76 − 10,000 = 869.31.
    expect(sourceLeg.amount).toBeCloseTo(-869.31, 2);
    expect(debtLeg.amount).toBeCloseTo(869.31, 2);

    const balances = computeDisplayChainBalances(cache, 1);
    const minBalance = Math.min(...balances);
    expect(minBalance).toBeGreaterThanOrEqual(FLOOR - EPS);
    expect(minBalance).toBeCloseTo(FLOOR, 2); // exactly at the floor, not below
  });

  it("removes both legs entirely when no payment amount can respect the floor", () => {
    seedScreenshotLedger(2846);
    // Raise the floor so that even a zero payment would leave the ledger below
    // it — the guard must drop the extra payment and leave the bills alone.
    const account = cache.accountRegister.findOne({ id: 1 })!;
    account.minAccountBalance = 12000;
    cache.accountRegister.update(account);

    guard.enforceFloors({
      accountRegisterIds: [1, 8],
      extraDebtPaymentLegs: [
        {
          sourceEntryId: "leg-src-1",
          debtEntryId: "leg-debt-1",
          sourceAccountRegisterId: 1,
          debtAccountRegisterId: 8,
        },
      ],
    });

    expect(cache.registerEntry.findById("leg-src-1")).toBeNull();
    expect(cache.registerEntry.findById("leg-debt-1")).toBeNull();
    // The payment row is gone from the display chain; the remaining ledger is
    // untouched (bills are never trimmed by the guard).
    const balances = computeDisplayChainBalances(cache, 1);
    expect(balances[balances.length - 1]).toBeCloseTo(10869.31, 2);
  });

  it("drops the November 2 re-fire payment and sizes the November 1 payment to the floor", () => {
    // Restored-production shape: Nov 1 extra payment, Nov 2 scheduled loan
    // payment, then a Nov 2 re-fired extra payment that ended at 9,964.00.
    seedScreenshotLedger(2846);

    const d = (input: string) => dateTimeService.create(input).toDate();
    cache.registerEntry.insert(
      makeEntry({
        id: "e-nov-loan-payment",
        accountRegisterId: 1,
        description: "Transfer for Payment to GM Financial",
        amount: -803.05,
        createdAt: d("2026-11-02T00:00:00Z"),
      }),
    );
    cache.registerEntry.insert(
      makeEntry({
        id: "leg-src-2",
        accountRegisterId: 1,
        description: "Debt Payment to GM Financial",
        sourceAccountRegisterId: 8,
        amount: -2636,
        createdAt: d("2026-11-02T00:00:00Z"),
      }),
    );
    cache.registerEntry.insert(
      makeEntry({
        id: "leg-debt-2",
        accountRegisterId: 8,
        description: "Extra debt payment from Novo MWC",
        sourceAccountRegisterId: 1,
        amount: 2636,
        createdAt: d("2026-11-02T00:00:00Z"),
      }),
    );

    guard.enforceFloors({
      accountRegisterIds: [1, 8],
      extraDebtPaymentLegs: [
        {
          sourceEntryId: "leg-src-1",
          debtEntryId: "leg-debt-1",
          sourceAccountRegisterId: 1,
          debtAccountRegisterId: 8,
        },
        {
          sourceEntryId: "leg-src-2",
          debtEntryId: "leg-debt-2",
          sourceAccountRegisterId: 1,
          debtAccountRegisterId: 8,
        },
      ],
    });

    // The re-fired November payment cannot respect the floor → removed.
    expect(cache.registerEntry.findById("leg-src-2")).toBeNull();
    expect(cache.registerEntry.findById("leg-debt-2")).toBeNull();

    // The October payment survives, trimmed so the ledger bottoms out exactly
    // at the floor: 10,953.07 − payment − 83.76 (Oct 2 bills) − 803.05
    // (Nov 2 scheduled loan payment) = 10,000 → payment = 66.26.
    const sourceLeg1 = cache.registerEntry.findById("leg-src-1")!;
    expect(sourceLeg1.amount).toBeCloseTo(-66.26, 2);

    const balances = computeDisplayChainBalances(cache, 1);
    expect(Math.min(...balances)).toBeGreaterThanOrEqual(FLOOR - EPS);
    expect(Math.min(...balances)).toBeCloseTo(FLOOR, 2);
  });

  it("ignores registers without a positive min balance", () => {
    seedScreenshotLedger(2846);
    const account = cache.accountRegister.findOne({ id: 1 })!;
    account.minAccountBalance = 0;
    cache.accountRegister.update(account);

    guard.enforceFloors({
      accountRegisterIds: [1, 8],
      extraDebtPaymentLegs: [
        {
          sourceEntryId: "leg-src-1",
          debtEntryId: "leg-debt-1",
          sourceAccountRegisterId: 1,
          debtAccountRegisterId: 8,
        },
      ],
    });

    expect(cache.registerEntry.findById("leg-src-1")!.amount).toBe(-2846);
  });
});

describe("TransferService extra debt payment latch", () => {
  let cache: ModernCacheService;
  let service: TransferService;
  let createEntry: ReturnType<typeof vi.fn>;

  function seedLatchFixture() {
    cache.accountRegister.insert(
      makeAccount({
        id: 1,
        name: "Checking",
        balance: 2000,
        latestBalance: 2000,
        minAccountBalance: 500,
        allowExtraPayment: true,
      }),
    );
    cache.accountRegister.insert(
      makeAccount({
        id: 2,
        name: "Loan",
        typeId: 5,
        balance: -500,
        latestBalance: -500,
        loanPaymentSortOrder: 1,
      }),
    );
    cache.registerEntry.insert(
      makeEntry({
        id: "seed-1",
        accountRegisterId: 1,
        amount: 2000,
        createdAt: dateTimeService.create("2024-01-01T00:00:00Z").toDate(),
      }),
    );
  }

  beforeEach(() => {
    cache = new ModernCacheService();
    createEntry = vi.fn();
    service = new TransferService(cache, {
      createEntry,
    } as unknown as RegisterEntryService);
    vi.spyOn(forecastLogger, "service").mockImplementation(() => {});
    vi.spyOn(forecastLogger, "serviceDebug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pays once per month: day 2 does not re-fire after a day 1 payment", async () => {
    seedLatchFixture();
    const source = cache.accountRegister.findOne({ id: 1 })!;

    await service.processExtraDebtPayments(
      [source],
      dateTimeService.create("2024-01-01T00:00:00Z").toDate(),
    );
    expect(createEntry).toHaveBeenCalled();

    createEntry.mockClear();
    await service.processExtraDebtPayments(
      [source],
      dateTimeService.create("2024-01-02T00:00:00Z").toDate(),
    );
    expect(createEntry).not.toHaveBeenCalled();

    // A new month may pay again.
    await service.processExtraDebtPayments(
      [source],
      dateTimeService.create("2024-02-01T00:00:00Z").toDate(),
    );
    expect(createEntry).toHaveBeenCalled();
  });

  it("does not latch when day 1 had nothing to pay, so day 2 can pay new funds", async () => {
    // No debt accounts yet: the day-1 pass fails without latching the month.
    cache.accountRegister.insert(
      makeAccount({
        id: 1,
        name: "Checking",
        balance: 5100,
        latestBalance: 5100,
        minAccountBalance: 5000,
        allowExtraPayment: true,
      }),
    );
    const source = cache.accountRegister.findOne({ id: 1 })!;

    await service.processExtraDebtPayments(
      [source],
      dateTimeService.create("2024-01-01T00:00:00Z").toDate(),
    );
    expect(createEntry).not.toHaveBeenCalled();

    // A debt account exists by Jan 2 and new projected income arrived →
    // the day-2 fallback pass should pay.
    cache.accountRegister.insert(
      makeAccount({
        id: 2,
        name: "Loan",
        typeId: 5,
        balance: -500,
        latestBalance: -500,
        loanPaymentSortOrder: 1,
      }),
    );
    cache.registerEntry.insert(
      makeEntry({
        id: "income-1",
        accountRegisterId: 1,
        amount: 2500,
        createdAt: dateTimeService.create("2024-01-02T00:00:00Z").toDate(),
      }),
    );
    source.balance = 7600;
    cache.accountRegister.update(source);
    await service.processExtraDebtPayments(
      [source],
      dateTimeService.create("2024-01-02T00:00:00Z").toDate(),
    );
    expect(createEntry).toHaveBeenCalled();
  });
});

describe("ForecastEngine min balance floor end-to-end", () => {
  let mockPrisma: any;
  let engine: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      accountRegister: {
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      registerEntry: {
        findMany: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({}),
      },
      reoccurrence: {
        findMany: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _min: { lastAt: null } }),
        update: vi.fn().mockResolvedValue({}),
      },
      reoccurrenceSkip: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      reoccurrenceSplit: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      savingsGoal: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
      $executeRaw: vi.fn().mockResolvedValue(undefined),
    };
    engine = ForecastEngineFactory.create(mockPrisma);
  });

  it("never lets the forecasted checking ledger dip below minAccountBalance", async () => {
    const FLOOR = 10000;
    mockPrisma.accountRegister.findMany.mockResolvedValue([
      {
        id: 1,
        name: "Novo MWC",
        typeId: 1,
        balance: 20000,
        budgetId: 1,
        accountId: "novo-main",
        latestBalance: 20000,
        minPayment: null,
        statementAt: dateTimeService.create("2025-08-01T12:00:00Z"),
        statementIntervalId: 3,
        apr1: null,
        apr2: null,
        apr3: null,
        apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: null,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: FLOOR,
        allowExtraPayment: true,
        isArchived: false,
        plaidId: null,
      },
      {
        id: 8,
        name: "GM Financial",
        typeId: 5,
        balance: -25432.07,
        budgetId: 1,
        accountId: "novo-main",
        latestBalance: -25432.07,
        minPayment: 803.05,
        statementAt: dateTimeService.create("2025-08-09T12:00:00Z"),
        statementIntervalId: 3,
        apr1: 0.05,
        apr2: null,
        apr3: null,
        apr1StartAt: dateTimeService.create("2000-01-01T00:00:00.000Z"),
        apr2StartAt: null,
        apr3StartAt: null,
        targetAccountRegisterId: 1,
        loanStartAt: null,
        loanPaymentsPerYear: null,
        loanTotalYears: null,
        loanOriginalAmount: null,
        loanPaymentSortOrder: 999,
        savingsGoalSortOrder: 999,
        accountSavingsGoal: null,
        minAccountBalance: 0,
        allowExtraPayment: false,
        isArchived: false,
        plaidId: null,
      },
    ]);
    mockPrisma.registerEntry.findMany.mockResolvedValue([]);
    mockPrisma.reoccurrence.findMany.mockResolvedValue([
      {
        id: 101,
        accountRegisterId: 1,
        budgetId: 1,
        accountId: "novo-main",
        description: "Groceries (Standard)",
        amount: -600,
        transferAccountRegisterId: null,
        intervalId: 3,
        intervalCount: 1,
        lastAt: new Date("2025-08-01T00:00:00.000Z"),
        lastRunAt: null,
        scheduleAnchorAt: null,
        endAt: null,
        totalIntervals: null,
        elapsedIntervals: null,
        updatedAt: new Date("2025-08-01T00:00:00.000Z"),
        adjustBeforeIfOnWeekend: false,
        categoryId: null,
        amountAdjustmentMode: "NONE",
        amountAdjustmentDirection: null,
        amountAdjustmentValue: null,
        amountAdjustmentIntervalId: null,
        amountAdjustmentIntervalCount: 1,
        amountAdjustmentAnchorAt: null,
      },
    ]);
    mockPrisma.registerEntry.deleteMany.mockResolvedValue({});
    mockPrisma.registerEntry.createMany.mockResolvedValue({});

    const result = await engine.recalculate({
      accountId: "novo-main",
      startDate: new Date("2025-08-01T00:00:00.000Z"),
      endDate: new Date("2025-12-01T00:00:00.000Z"),
      logging: { enabled: false },
    });

    expect(result.isSuccess, `engine errors: ${JSON.stringify(result.errors)}`).toBe(true);

    const checkingEntries = (result.registerEntries || []).filter(
      (entry: any) => entry.accountRegisterId === 1,
    );

    // The sweep must actually have run for this test to be meaningful.
    const extraPayments = checkingEntries.filter((entry: any) =>
      (entry.description || "").startsWith("Debt Payment to GM Financial"),
    );
    expect(extraPayments.length).toBeGreaterThan(0);

    // At most one extra payment pass per month (days 2–3 are fallbacks only).
    const perMonth = new Map<string, number>();
    for (const entry of extraPayments) {
      const key = dateTimeService.format(
        "YYYY-MM",
        new Date(entry.createdAt),
      );
      perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
    }
    for (const count of perMonth.values()) {
      expect(count).toBeLessThanOrEqual(1);
    }

    // The engine-returned balances are the post-guard display chain: the
    // forecasted checking ledger must never dip below the floor.
    for (const entry of checkingEntries) {
      expect(entry.balance).toBeGreaterThanOrEqual(FLOOR - EPS);
    }
  });
});
