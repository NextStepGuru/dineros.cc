/**
 * Asset Depreciation/Appreciation forecast tests
 * Tests vehicle asset depreciation and collectable vehicle appreciation over time
 *
 * Run: TZ=UTC pnpm exec vitest run --config vitest.config.all.ts server/services/forecast/__tests__/assetDepreciation.forecast.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ForecastEngine } from "../ForecastEngine";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import { dateTimeService } from "../DateTimeService";

const ACCOUNT_ID = "asset-depreciation-account";

/** Round for stable snapshots / float compares */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sortByCreatedAt<
  T extends { createdAt: Date | string | number },
>(arr: readonly T[]): T[] {
  const copy = [...arr];
  copy.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return copy;
}

function baseRegister(overrides: Record<string, unknown>) {
  return {
    budgetId: 1,
    accountId: ACCOUNT_ID,
    statementIntervalId: 3, // Monthly
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

describe("Asset Depreciation/Appreciation forecast", () => {
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

  it("Vehicle Asset declining-balance depreciation over 12 months", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    await db.accountRegister.create({
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
        name: "My Car",
        typeId: 20, // Vehicle Asset
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.15, // 15% annual
        depreciationMethod: "declining-balance",
        assetOriginalValue: 30_000,
        assetResidualValue: 5_000,
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-12-31T00:00:00.000Z");

    // In-memory mock does not propagate opening balance; seed entry so getProjectedBalanceAtDate is correct
    await db.registerEntry.create({
      data: {
        accountRegisterId: vehicle.id,
        description: "Opening value",
        amount: 30_000,
        balance: 30_000,
        createdAt: startDate,
        isBalanceEntry: false,
        isManualEntry: true,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isReconciled: false,
        typeId: 1,
      },
    });

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);
    expect(result.errors).toBeUndefined();

    const vehicleEntries = result.registerEntries.filter(
      (e) => e.accountRegisterId === vehicle.id
    );

    const depreciationEntries = vehicleEntries.filter(
      (e) => e.description === "Depreciation Adjustment"
    );

    // Should have 12 monthly depreciation entries
    expect(depreciationEntries.length).toBe(12);

    // First month: 30,000 * 0.15 / 12 = 375 (opening from seed entry)
    const firstDep = depreciationEntries.at(0);
    expect(firstDep).toBeDefined();
    expect(r2(Number(firstDep?.amount))).toBe(-375);

    // Verify balance decreases each month (mock may give balance entry balance 0)
    const sortedEntries = sortByCreatedAt(vehicleEntries);
    let prevBalance = 30_000;
    for (const entry of sortedEntries) {
      if (entry.isBalanceEntry) {
        const bal = r2(Number(entry.balance));
        if (bal === 0) prevBalance = 30_000; // mock: treat 0 as opening
        else expect(bal).toBe(r2(prevBalance));
        continue;
      }
      const newBalance = r2(Number(entry.balance));
      expect(newBalance).toBeLessThanOrEqual(r2(prevBalance));
      prevBalance = Number(entry.balance);
    }

    // Final balance should be less than starting balance
    const lastEntry = sortedEntries.at(-1);
    expect(lastEntry).toBeDefined();
    expect(Number(lastEntry?.balance)).toBeLessThan(30_000);
    expect(Number(lastEntry?.balance)).toBeGreaterThan(5_000); // Above residual value
  });

  it("Vehicle Asset straight-line depreciation over 12 months", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const vehicle = await db.accountRegister.create({
      data: baseRegister({
        name: "My Car",
        typeId: 20,
        balance: 30_000,
        latestBalance: 30_000,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.15,
        depreciationMethod: "straight-line",
        assetOriginalValue: 30_000,
        assetResidualValue: 5_000,
        assetUsefulLifeYears: 5, // 5 years = 60 months
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-12-31T00:00:00.000Z");

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    const depreciationEntries = result.registerEntries.filter(
      (e) =>
        e.accountRegisterId === vehicle.id &&
        e.description === "Depreciation Adjustment"
    );

    expect(depreciationEntries.length).toBe(12);

    // Straight-line: (30,000 - 5,000) / 60 = 416.67 per month
    const expectedMonthly = (30_000 - 5_000) / 60;
    for (const entry of depreciationEntries) {
      expect(r2(Number(entry.amount))).toBe(r2(-expectedMonthly));
    }
  });

  it("Vehicle Asset depreciation stops at residual value", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const vehicle = await db.accountRegister.create({
      data: baseRegister({
        name: "My Car",
        typeId: 20,
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.5, // High rate to test floor
        depreciationMethod: "declining-balance",
        assetOriginalValue: 10_000,
        assetResidualValue: 5_000,
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-12-31T00:00:00.000Z");

    await db.registerEntry.create({
      data: {
        accountRegisterId: vehicle.id,
        description: "Opening value",
        amount: 10_000,
        balance: 10_000,
        createdAt: startDate,
        isBalanceEntry: false,
        isManualEntry: true,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isReconciled: false,
        typeId: 1,
      },
    });

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    const vehicleEntries = result.registerEntries.filter(
      (e) => e.accountRegisterId === vehicle.id
    );
    const sortedEntries = sortByCreatedAt(vehicleEntries);

    // Verify no balance goes below residual value (skip balance entry if mock gave 0)
    for (const entry of sortedEntries) {
      if (entry.isBalanceEntry && Number(entry.balance) === 0) continue;
      expect(Number(entry.balance)).toBeGreaterThanOrEqual(5_000);
    }

    // Final balance should be at or above residual value
    const lastEntry = sortedEntries.at(-1);
    expect(lastEntry).toBeDefined();
    expect(Number(lastEntry?.balance)).toBeGreaterThanOrEqual(5_000);
  });

  it("Collectable Vehicle appreciation over 12 months", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const collectable = await db.accountRegister.create({
      data: baseRegister({
        name: "Vintage Car",
        typeId: 21, // Collectable Vehicle
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.05, // 5% annual appreciation
        depreciationMethod: "compound",
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-12-31T00:00:00.000Z");

    await db.registerEntry.create({
      data: {
        accountRegisterId: collectable.id,
        description: "Opening value",
        amount: 50_000,
        balance: 50_000,
        createdAt: startDate,
        isBalanceEntry: false,
        isManualEntry: true,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isReconciled: false,
        typeId: 1,
      },
    });

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    const appreciationEntries = result.registerEntries.filter(
      (e) =>
        e.accountRegisterId === collectable.id &&
        e.description === "Appreciation Adjustment"
    );

    expect(appreciationEntries.length).toBe(12);

    // First month: 50,000 * 0.05 / 12 = 208.33
    const firstApp = appreciationEntries.at(0);
    expect(firstApp).toBeDefined();
    expect(r2(Number(firstApp?.amount))).toBe(208.33);

    // Verify balance increases each month
    const collectableEntries = result.registerEntries.filter(
      (e) => e.accountRegisterId === collectable.id
    );
    const sortedEntries = sortByCreatedAt(collectableEntries);

    let prevBalance = 50_000;
    for (const entry of sortedEntries) {
      if (entry.isBalanceEntry) {
        if (Number(entry.balance) === 0) prevBalance = 50_000;
        else expect(r2(Number(entry.balance))).toBe(r2(prevBalance));
        continue;
      }
      const newBalance = r2(Number(entry.balance));
      if (entry.description === "Appreciation Adjustment") {
        expect(newBalance).toBeGreaterThan(r2(prevBalance));
      }
      prevBalance = Number(entry.balance);
    }

    // Final balance should be greater than starting balance
    const lastEntry = sortedEntries.at(-1);
    expect(lastEntry).toBeDefined();
    expect(Number(lastEntry?.balance)).toBeGreaterThan(50_000);
  });

  it("Net worth reflects depreciating vehicle", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const checking = await db.accountRegister.create({
      data: baseRegister({
        name: "Checking",
        typeId: 1,
        balance: 20_000,
        latestBalance: 20_000,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const vehicle = await db.accountRegister.create({
      data: baseRegister({
        name: "My Car",
        typeId: 20,
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.15,
        depreciationMethod: "declining-balance",
        assetOriginalValue: 30_000,
        assetResidualValue: 5_000,
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-12-31T00:00:00.000Z");

    await db.registerEntry.create({
      data: {
        accountRegisterId: vehicle.id,
        description: "Opening value",
        amount: 30_000,
        balance: 30_000,
        createdAt: startDate,
        isBalanceEntry: false,
        isManualEntry: true,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isReconciled: false,
        typeId: 1,
      },
    });

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    // Known start net worth from setup (checking 20k + vehicle 30k seed)
    const expectedStartNetWorth = 50_000;

    // Calculate net worth at end
    const allEntries = sortByCreatedAt(result.registerEntries);
    const endChecking = allEntries.findLast(
      (e) => e.accountRegisterId === checking.id,
    );
    const endVehicle = allEntries.findLast(
      (e) => e.accountRegisterId === vehicle.id,
    );
    expect(endChecking).toBeDefined();
    expect(endVehicle).toBeDefined();
    const endNetWorth =
      Number(endChecking?.balance) + Number(endVehicle?.balance);

    // Net worth should decrease as vehicle depreciates
    expect(endNetWorth).toBeLessThan(expectedStartNetWorth);
    expect(endNetWorth).toBeGreaterThan(20_000 + 5_000); // Above checking + residual
  });

  it("Net worth reflects appreciating collectable", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const checking = await db.accountRegister.create({
      data: baseRegister({
        name: "Checking",
        typeId: 1,
        balance: 10_000,
        latestBalance: 10_000,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const collectable = await db.accountRegister.create({
      data: baseRegister({
        name: "Vintage Car",
        typeId: 21,
        balance: 50_000,
        latestBalance: 50_000,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.05,
        depreciationMethod: "compound",
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-12-31T00:00:00.000Z");

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    const allEntries = sortByCreatedAt(result.registerEntries);

    const startChecking = allEntries
      .filter((e) => e.accountRegisterId === checking.id)
      .find((e) => e.isBalanceEntry);
    const startCollectable = allEntries
      .filter((e) => e.accountRegisterId === collectable.id)
      .find((e) => e.isBalanceEntry);
    expect(startChecking).toBeDefined();
    expect(startCollectable).toBeDefined();
    const startNetWorth =
      Number(startChecking?.balance) + Number(startCollectable?.balance);

    const endChecking = allEntries.findLast(
      (e) => e.accountRegisterId === checking.id,
    );
    const endCollectable = allEntries.findLast(
      (e) => e.accountRegisterId === collectable.id,
    );
    expect(endChecking).toBeDefined();
    expect(endCollectable).toBeDefined();
    const endNetWorth =
      Number(endChecking?.balance) + Number(endCollectable?.balance);

    // Net worth should increase as collectable appreciates
    expect(endNetWorth).toBeGreaterThan(startNetWorth);
  });

  it("Mixed scenario: checking + depreciating vehicle + appreciating collectable", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const checking = await db.accountRegister.create({
      data: baseRegister({
        name: "Checking",
        typeId: 1,
        balance: 15_000,
        latestBalance: 15_000,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const vehicle = await db.accountRegister.create({
      data: baseRegister({
        name: "My Car",
        typeId: 20,
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.2, // 20% annual
        depreciationMethod: "declining-balance",
        assetOriginalValue: 25_000,
        assetResidualValue: 3_000,
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const collectable = await db.accountRegister.create({
      data: baseRegister({
        name: "Vintage Car",
        typeId: 21,
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.06, // 6% annual
        depreciationMethod: "compound",
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-12-31T00:00:00.000Z");

    await db.registerEntry.create({
      data: {
        accountRegisterId: vehicle.id,
        description: "Opening value",
        amount: 25_000,
        balance: 25_000,
        createdAt: startDate,
        isBalanceEntry: false,
        isManualEntry: true,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isReconciled: false,
        typeId: 1,
      },
    });
    await db.registerEntry.create({
      data: {
        accountRegisterId: collectable.id,
        description: "Opening value",
        amount: 40_000,
        balance: 40_000,
        createdAt: startDate,
        isBalanceEntry: false,
        isManualEntry: true,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isReconciled: false,
        typeId: 1,
      },
    });

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    const allEntries = sortByCreatedAt(result.registerEntries);

    // Mock may give balance entry 0; use known start values from setup
    const startBalances = {
      checking: 15_000,
      vehicle: 25_000,
      collectable: 40_000,
    };

    const endCheckingBal = allEntries.findLast(
      (e) => e.accountRegisterId === checking.id,
    );
    const endVehicleBal = allEntries.findLast(
      (e) => e.accountRegisterId === vehicle.id,
    );
    const endCollectableBal = allEntries.findLast(
      (e) => e.accountRegisterId === collectable.id,
    );
    expect(endCheckingBal).toBeDefined();
    expect(endVehicleBal).toBeDefined();
    expect(endCollectableBal).toBeDefined();

    const endBalances = {
      checking: Number(endCheckingBal?.balance),
      vehicle: Number(endVehicleBal?.balance),
      collectable: Number(endCollectableBal?.balance),
    };

    // Vehicle should depreciate
    expect(endBalances.vehicle).toBeLessThan(startBalances.vehicle);
    expect(endBalances.vehicle).toBeGreaterThanOrEqual(3_000);

    // Collectable should appreciate
    expect(endBalances.collectable).toBeGreaterThan(startBalances.collectable);

    // Net worth trajectory depends on relative rates
    const startNetWorth =
      startBalances.checking + startBalances.vehicle + startBalances.collectable;
    const endNetWorth =
      endBalances.checking + endBalances.vehicle + endBalances.collectable;

    // In this case, depreciation (20%) is much higher than appreciation (6%), so net worth should decrease
    expect(endNetWorth).toBeLessThan(startNetWorth);
  });

  it("Multi-year depreciation projection", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const vehicle = await db.accountRegister.create({
      data: baseRegister({
        name: "My Car",
        typeId: 20,
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.15,
        depreciationMethod: "declining-balance",
        assetOriginalValue: 30_000,
        assetResidualValue: 5_000,
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2026-12-31T00:00:00.000Z"); // 3 years

    await db.registerEntry.create({
      data: {
        accountRegisterId: vehicle.id,
        description: "Opening value",
        amount: 30_000,
        balance: 30_000,
        createdAt: startDate,
        isBalanceEntry: false,
        isManualEntry: true,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isReconciled: false,
        typeId: 1,
      },
    });

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    const depreciationEntries = result.registerEntries.filter(
      (e) =>
        e.accountRegisterId === vehicle.id &&
        e.description === "Depreciation Adjustment"
    );

    // Should have 36 monthly depreciation entries (3 years)
    expect(depreciationEntries.length).toBe(36);

    const vehicleEntries = sortByCreatedAt(
      result.registerEntries.filter(
        (e) => e.accountRegisterId === vehicle.id,
      ),
    );

    // Final balance should be close to residual value after 3 years
    const lastEntry = vehicleEntries.at(-1);
    expect(lastEntry).toBeDefined();
    const finalBalance = Number(lastEntry?.balance);
    expect(finalBalance).toBeGreaterThanOrEqual(5_000);
    expect(finalBalance).toBeLessThan(30_000);
  });

  it("Running balance continuity for asset entries", async () => {
    dateTimeService.setNowOverride("2024-01-01T12:00:00.000Z");

    const vehicle = await db.accountRegister.create({
      data: baseRegister({
        name: "My Car",
        typeId: 20,
        balance: 0,
        latestBalance: 0,
        statementAt: new Date("2024-01-01T00:00:00.000Z"),
        depreciationRate: 0.15,
        depreciationMethod: "declining-balance",
        assetOriginalValue: 30_000,
        assetResidualValue: 5_000,
        assetStartAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });

    const startDate = new Date("2024-01-01T00:00:00.000Z");
    const endDate = new Date("2024-12-31T00:00:00.000Z");

    await db.registerEntry.create({
      data: {
        accountRegisterId: vehicle.id,
        description: "Opening value",
        amount: 30_000,
        balance: 30_000,
        createdAt: startDate,
        isBalanceEntry: false,
        isManualEntry: true,
        isProjected: false,
        isPending: false,
        isCleared: false,
        isReconciled: false,
        typeId: 1,
      },
    });

    const result = await engine.recalculate({
      accountId: ACCOUNT_ID,
      startDate,
      endDate,
      logging: { enabled: false },
    });

    expect(result.isSuccess).toBe(true);

    const vehicleEntries = sortByCreatedAt(
      result.registerEntries.filter(
        (e) => e.accountRegisterId === vehicle.id,
      ),
    );

    // Verify running balance continuity (mock may give balance entry balance 0)
    let runningBalance = 0;
    for (const row of vehicleEntries) {
      if (row.isBalanceEntry) {
        const bal = Number(row.balance);
        if (bal) {
          expect(r2(bal)).toBe(r2(Number(row.amount)));
          runningBalance = bal;
        }
        continue;
      }
      const expected = r2(runningBalance + Number(row.amount));
      expect(r2(Number(row.balance))).toBe(expected);
      runningBalance = Number(row.balance);
    }
  });
});
