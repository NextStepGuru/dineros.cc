import { beforeEach, describe, expect, it, vi } from "vitest";

import * as forecastRiskAlertService from "../forecastRiskAlertService";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

// Chainable dateTimeService mock covering the API surface the risk service uses.
const dt = vi.hoisted(() => {
  const NOW_HOISTED = new Date("2026-10-02T00:00:00.000Z");
  const DAY_MS_HOISTED = 86_400_000;

  function resolveDate(input: unknown): Date {
    if (input == null) return NOW_HOISTED;
    if (input instanceof Date) return input;
    if (typeof input === "string" || typeof input === "number") {
      return new Date(input);
    }
    const maybe = input as { toDate?: () => Date };
    if (typeof maybe?.toDate === "function") return maybe.toDate();
    return NOW_HOISTED;
  }

  function chain(date: Date) {
    return {
      toDate: () => date,
      toISOString: () => date.toISOString(),
      utc: () => chain(date),
      add: (amount: unknown) => {
        const days =
          typeof amount === "number"
            ? amount
            : Number((amount as { day?: number })?.day ?? 0);
        return chain(new Date(date.getTime() + days * DAY_MS_HOISTED));
      },
    };
  }

  return {
    NOW: NOW_HOISTED,
    DAY_MS: DAY_MS_HOISTED,
    dateTimeService: {
      now: vi.fn(() => chain(NOW_HOISTED)),
      toDate: vi.fn((input?: unknown) =>
        input === undefined ? new Date(NOW_HOISTED) : resolveDate(input),
      ),
      toISOString: vi.fn((input?: unknown) => resolveDate(input).toISOString()),
      startOf: vi.fn((_unit: string, input?: unknown) => {
        const d = resolveDate(input);
        return chain(
          new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())),
        );
      }),
      endOf: vi.fn((_unit: string, input?: unknown) => {
        const d = resolveDate(input);
        return chain(
          new Date(
            Date.UTC(
              d.getUTCFullYear(),
              d.getUTCMonth(),
              d.getUTCDate(),
              23,
              59,
              59,
              999,
            ),
          ),
        );
      }),
      add: vi.fn((amount: number, _unit?: string) =>
        chain(new Date(NOW_HOISTED.getTime() + amount * DAY_MS_HOISTED)),
      ),
      diff: vi.fn((a: unknown, b: unknown, unit?: string) => {
        const ms = resolveDate(a).getTime() - resolveDate(b).getTime();
        return unit === "days" ? ms / DAY_MS_HOISTED : ms;
      }),
      isSameOrAfter: vi.fn(
        (a: unknown, b: unknown) =>
          resolveDate(a).getTime() >= resolveDate(b).getTime(),
      ),
      isSameOrBefore: vi.fn(
        (a: unknown, b: unknown) =>
          resolveDate(a).getTime() <= resolveDate(b).getTime(),
      ),
    },
  };
});

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: dt.dateTimeService,
}));

// Deterministic ledger mock: rows pass through with numeric balances.
vi.mock("~/server/lib/registerLedgerFuture", () => ({
  futureRegisterEntryOr: [{ isCleared: false, isReconciled: false }],
  registerBelongsToUserAccountWhere: vi.fn(
    (accountId: string, userId: number) => ({
      register: {
        account: {
          is: { userAccounts: { some: { userId } }, id: accountId },
        },
      },
    }),
  ),
  stripRegisterEntryPlaidJson: vi.fn((entries: unknown[]) =>
    entries.map((entry) => {
      const { plaidJson: _plaidJson, ...rest } = entry as Record<string, unknown>;
      return rest;
    }),
  ),
  buildFutureLedgerSorted: vi.fn((params: Record<string, unknown>) =>
    (
      params.registerEntriesWithoutPlaidJson as Array<Record<string, unknown>>
    ).map((entry) => ({
      ...entry,
      amount: Number(entry.amount),
      balance: Number(entry.balance),
    })),
  ),
}));

let prisma: any;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ prisma } = await import("~/server/clients/prismaClient"));
  // Default access check passes; individual tests override.
  prisma.budget.findFirst.mockResolvedValue({ id: 7, accountId: "acct-1" });
  prisma.accountRegister.findMany.mockResolvedValue([]);
});

function registerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    name: "Checking",
    latestBalance: 100,
    minAccountBalance: null,
    type: { isCredit: false },
    ...overrides,
  };
}

function futureEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    accountRegisterId: 11,
    createdAt: new Date("2026-10-10T00:00:00.000Z"),
    amount: -150,
    balance: -50,
    plaidJson: null,
    ...overrides,
  };
}

describe("forecastRiskAlertService", () => {
  describe("evaluateForecastRiskAlerts", () => {
    it("throws 403 when the budget is not accessible", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        forecastRiskAlertService.evaluateForecastRiskAlerts({
          userId: 1,
          budgetId: 7,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.accountRegister.findMany).not.toHaveBeenCalled();
    });

    it("returns no alerts without querying entries when the budget has no registers", async () => {
      prisma.accountRegister.findMany.mockResolvedValue([]);

      const result =
        await forecastRiskAlertService.evaluateForecastRiskAlerts({
          userId: 1,
          budgetId: 7,
        });

      expect(result).toEqual({
        evaluatedAt: dt.NOW.toISOString(),
        daysAhead: 90,
        alerts: [],
      });
      expect(prisma.registerEntry.findMany).not.toHaveBeenCalled();
    });

    it("raises a negative-balance alert when a future ledger entry dips below zero", async () => {
      prisma.accountRegister.findMany.mockResolvedValue([registerRow()]);
      prisma.registerEntry.findMany.mockResolvedValue([futureEntry()]);

      const result =
        await forecastRiskAlertService.evaluateForecastRiskAlerts({
          userId: 1,
          budgetId: 7,
        });

      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountId: "acct-1",
            budgetId: 7,
            isArchived: false,
          }),
        }),
      );
      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountRegisterId: { in: [11] },
            OR: [{ isCleared: false, isReconciled: false }],
          }),
        }),
      );

      expect(result.daysAhead).toBe(90);
      expect(result.evaluatedAt).toBe(dt.NOW.toISOString());
      expect(result.alerts).toEqual([
        {
          key: "11:negative_balance:2026-10-10",
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          riskType: "negative_balance",
          threshold: 0,
          projectedBalanceAtRisk: -50,
          projectedLowestBalance: -50,
          riskAt: "2026-10-10T00:00:00.000Z",
          daysUntilRisk: 8,
        },
      ]);
    });

    it("raises a below-min-balance alert against the register minimum", async () => {
      prisma.accountRegister.findMany.mockResolvedValue([
        registerRow({ latestBalance: 300, minAccountBalance: 200 }),
      ]);
      prisma.registerEntry.findMany.mockResolvedValue([
        futureEntry({ balance: 150 }),
      ]);

      const result =
        await forecastRiskAlertService.evaluateForecastRiskAlerts({
          userId: 1,
          budgetId: 7,
        });

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0]).toMatchObject({
        riskType: "below_min_balance",
        threshold: 200,
        projectedBalanceAtRisk: 150,
        projectedLowestBalance: 150,
        daysUntilRisk: 8,
      });
    });

    it("flags registers already below their threshold today with a zero-day horizon", async () => {
      prisma.accountRegister.findMany.mockResolvedValue([
        registerRow({ latestBalance: -20 }),
      ]);
      prisma.registerEntry.findMany.mockResolvedValue([]);

      const result =
        await forecastRiskAlertService.evaluateForecastRiskAlerts({
          userId: 1,
          budgetId: 7,
        });

      expect(result.alerts).toEqual([
        {
          key: "11:negative_balance:2026-10-02",
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          riskType: "negative_balance",
          threshold: 0,
          projectedBalanceAtRisk: -20,
          projectedLowestBalance: -20,
          riskAt: dt.NOW.toISOString(),
          daysUntilRisk: 0,
        },
      ]);
    });

    it("ignores credit registers", async () => {
      prisma.accountRegister.findMany.mockResolvedValue([
        registerRow({
          type: { isCredit: true },
          latestBalance: -500,
        }),
      ]);
      prisma.registerEntry.findMany.mockResolvedValue([
        futureEntry({ balance: -600 }),
      ]);

      const result =
        await forecastRiskAlertService.evaluateForecastRiskAlerts({
          userId: 1,
          budgetId: 7,
        });

      expect(result.alerts).toEqual([]);
    });

    it("ignores entries outside the evaluation window", async () => {
      prisma.accountRegister.findMany.mockResolvedValue([registerRow()]);
      prisma.registerEntry.findMany.mockResolvedValue([
        futureEntry({
          id: "past",
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
          balance: -10,
        }),
        futureEntry({
          id: "beyond-horizon",
          createdAt: new Date("2027-01-20T00:00:00.000Z"),
          balance: -10,
        }),
      ]);

      const result =
        await forecastRiskAlertService.evaluateForecastRiskAlerts({
          userId: 1,
          budgetId: 7,
        });

      expect(result.alerts).toEqual([]);
    });

    it("shrinks the window with a custom daysAhead and grows it with the default", async () => {
      prisma.accountRegister.findMany.mockResolvedValue([registerRow()]);
      prisma.registerEntry.findMany.mockResolvedValue([
        futureEntry({ createdAt: new Date("2026-11-20T00:00:00.000Z") }),
      ]);

      const narrow = await forecastRiskAlertService.evaluateForecastRiskAlerts({
        userId: 1,
        budgetId: 7,
        daysAhead: 30,
      });
      expect(narrow.daysAhead).toBe(30);
      expect(narrow.alerts).toEqual([]);

      const wide = await forecastRiskAlertService.evaluateForecastRiskAlerts({
        userId: 1,
        budgetId: 7,
      });
      expect(wide.alerts).toHaveLength(1);
      expect(wide.alerts[0]).toMatchObject({
        riskAt: "2026-11-20T00:00:00.000Z",
        daysUntilRisk: 49,
      });
    });

    it("sorts alerts by days until risk, breaking ties by projected balance at risk", async () => {
      prisma.accountRegister.findMany.mockResolvedValue([
        registerRow({ id: 21, name: "Far" }),
        registerRow({ id: 11, name: "Deep" }),
      ]);
      prisma.registerEntry.findMany.mockResolvedValue([
        futureEntry({
          accountRegisterId: 21,
          createdAt: new Date("2026-10-05T00:00:00.000Z"),
          balance: -10,
        }),
        futureEntry({
          accountRegisterId: 11,
          createdAt: new Date("2026-10-05T00:00:00.000Z"),
          balance: -50,
        }),
      ]);

      const result =
        await forecastRiskAlertService.evaluateForecastRiskAlerts({
          userId: 1,
          budgetId: 7,
        });

      expect(result.alerts.map((a) => a.accountRegisterId)).toEqual([11, 21]);
      expect(result.alerts[0].projectedBalanceAtRisk).toBe(-50);
      expect(result.alerts[1].projectedBalanceAtRisk).toBe(-10);
    });
  });
});
