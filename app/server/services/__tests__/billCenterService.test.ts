import { beforeEach, describe, expect, it, vi } from "vitest";

import * as billCenterService from "../billCenterService";

const NOW = new Date("2026-10-02T00:00:00.000Z");

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

// Chainable dateTimeService mock covering the API surface billCenterService uses.
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

vi.mock("~/server/services/forecast/reoccurrenceIntervals", () => ({
  applyReoccurrenceAmountAdjustment: vi.fn(),
  computeFirstNextOccurrenceDate: vi.fn(),
  countCompletedAdjustmentSteps: vi.fn(),
}));

let prisma: any;
let applyReoccurrenceAmountAdjustment: any;
let computeFirstNextOccurrenceDate: any;
let countCompletedAdjustmentSteps: any;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ prisma } = await import("~/server/clients/prismaClient"));
  ({
    applyReoccurrenceAmountAdjustment,
    computeFirstNextOccurrenceDate,
    countCompletedAdjustmentSteps,
  } = await import("~/server/services/forecast/reoccurrenceIntervals"));

  // Reset implementations and once-queues left over from prior tests.
  computeFirstNextOccurrenceDate.mockReset();
  computeFirstNextOccurrenceDate.mockReturnValue(null);
  applyReoccurrenceAmountAdjustment.mockReset();
  applyReoccurrenceAmountAdjustment.mockImplementation((amount: number) =>
    Number(amount),
  );
  countCompletedAdjustmentSteps.mockReset();
  countCompletedAdjustmentSteps.mockReturnValue(0);

  // Default access + no-op sync; individual tests override.
  prisma.budget.findFirst.mockResolvedValue({ id: 7, accountId: "acct-1" });
  prisma.interval.findMany.mockResolvedValue([{ id: 3, name: "monthly" }]);
  prisma.reoccurrence.findMany.mockResolvedValue([]);
  prisma.billProfile.upsert.mockResolvedValue({
    id: 500,
    reminderDaysBefore: null,
  });
  prisma.billInstance.findMany.mockResolvedValue([]);
});

function reoccurrenceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    accountId: "acct-1",
    accountRegisterId: 11,
    intervalId: 3,
    intervalCount: 1,
    amount: 100,
    description: "Rent",
    lastAt: new Date("2026-09-25T00:00:00.000Z"),
    transferAccountRegisterId: null,
    amountAdjustmentMode: "NONE",
    amountAdjustmentAnchorAt: null,
    amountAdjustmentDirection: null,
    amountAdjustmentIntervalId: null,
    amountAdjustmentIntervalCount: null,
    amountAdjustmentValue: null,
    register: { id: 11, name: "Checking", latestBalance: 1000 },
    ...overrides,
  };
}

function billInstanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 201,
    billProfileId: 500,
    accountRegisterId: 11,
    dueAt: new Date("2026-10-05T00:00:00.000Z"),
    amount: 120,
    status: "DUE_SOON",
    paidAt: null,
    paidAmount: null,
    note: null,
    billProfile: {
      id: 500,
      kind: "BILL",
      payee: "Electric",
      isAutoPay: true,
      graceDays: 3,
      expectedAmountLow: null,
      expectedAmountHigh: null,
      reminderDaysBefore: "7,3,1",
      priority: 1,
      reoccurrenceId: 5,
      register: { id: 11, name: "Checking", latestBalance: 1000 },
      reoccurrence: { description: "Electric bill", amount: 115 },
    },
    ...overrides,
  };
}

describe("billCenterService", () => {
  describe("syncBillCenter", () => {
    it("throws 403 when the budget is not accessible", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        billCenterService.syncBillCenter({ userId: 1, budgetId: 7 }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("creates a bill profile and upserts occurrences along the horizon until the next date is null", async () => {
      prisma.reoccurrence.findMany.mockResolvedValue([reoccurrenceRow()]);
      computeFirstNextOccurrenceDate
        .mockReturnValueOnce(new Date("2026-10-05T00:00:00.000Z"))
        .mockReturnValueOnce(new Date("2026-10-12T00:00:00.000Z"));
      prisma.billInstance.findFirst.mockResolvedValue(null);

      await billCenterService.syncBillCenter({ userId: 1, budgetId: 7 });

      expect(prisma.reoccurrence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ accountId: "acct-1" }),
        }),
      );
      expect(prisma.billProfile.upsert).toHaveBeenCalledWith({
        where: { reoccurrenceId: 5 },
        create: {
          accountId: "acct-1",
          budgetId: 7,
          accountRegisterId: 11,
          reoccurrenceId: 5,
          kind: "BILL",
          payee: "Rent",
          reminderDaysBefore: "7,3,1",
        },
        update: {
          accountId: "acct-1",
          budgetId: 7,
          accountRegisterId: 11,
        },
        select: { id: true, reminderDaysBefore: true },
      });

      const firstCall = computeFirstNextOccurrenceDate.mock.calls[0][0];
      expect(firstCall).toEqual({
        lastAt: new Date("2026-09-25T00:00:00.000Z"),
        intervalId: 3,
        intervalCount: 1,
        intervalName: "monthly",
      });

      expect(prisma.billInstance.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.billInstance.upsert).toHaveBeenNthCalledWith(1, {
        where: {
          billProfileId_dueAt: {
            billProfileId: 500,
            dueAt: new Date("2026-10-05T00:00:00.000Z"),
          },
        },
        create: {
          accountId: "acct-1",
          budgetId: 7,
          accountRegisterId: 11,
          reoccurrenceId: 5,
          billProfileId: 500,
          dueAt: new Date("2026-10-05T00:00:00.000Z"),
          amount: 100,
          status: "DUE_SOON",
        },
        update: { amount: 100, status: "DUE_SOON", updatedAt: NOW },
      });
      expect(prisma.billInstance.upsert).toHaveBeenNthCalledWith(2, {
        where: {
          billProfileId_dueAt: {
            billProfileId: 500,
            dueAt: new Date("2026-10-12T00:00:00.000Z"),
          },
        },
        create: {
          accountId: "acct-1",
          budgetId: 7,
          accountRegisterId: 11,
          reoccurrenceId: 5,
          billProfileId: 500,
          dueAt: new Date("2026-10-12T00:00:00.000Z"),
          amount: 100,
          status: "UPCOMING",
        },
        update: { amount: 100, status: "UPCOMING", updatedAt: NOW },
      });
    });

    it("keeps a manually resolved status on existing instances", async () => {
      prisma.reoccurrence.findMany.mockResolvedValue([reoccurrenceRow()]);
      computeFirstNextOccurrenceDate.mockReturnValueOnce(
        new Date("2026-09-25T00:00:00.000Z"),
      );
      prisma.billInstance.findFirst.mockResolvedValue({ status: "PAID" });

      await billCenterService.syncBillCenter({ userId: 1, budgetId: 7 });

      expect(prisma.billInstance.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.billInstance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: "PAID" }),
          update: expect.objectContaining({ status: "PAID" }),
        }),
      );
    });

    it("uses TRANSFER as default kind for transfer reoccurrences", async () => {
      prisma.reoccurrence.findMany.mockResolvedValue([
        reoccurrenceRow({ transferAccountRegisterId: 22, lastAt: null }),
      ]);

      await billCenterService.syncBillCenter({ userId: 1, budgetId: 7 });

      expect(prisma.billProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ kind: "TRANSFER" }),
        }),
      );
      // No lastAt: occurrences are never computed.
      expect(prisma.billInstance.upsert).not.toHaveBeenCalled();
    });

    it("applies amount adjustment steps to the upserted amount", async () => {
      prisma.reoccurrence.findMany.mockResolvedValue([
        reoccurrenceRow({
          amountAdjustmentMode: "STEP",
          amountAdjustmentAnchorAt: new Date("2026-01-01T00:00:00.000Z"),
          amountAdjustmentDirection: "increase",
          amountAdjustmentValue: 5,
        }),
      ]);
      computeFirstNextOccurrenceDate.mockReturnValueOnce(
        new Date("2026-10-05T00:00:00.000Z"),
      );
      countCompletedAdjustmentSteps.mockReturnValue(2);
      applyReoccurrenceAmountAdjustment.mockReturnValue(90);
      prisma.billInstance.findFirst.mockResolvedValue(null);

      await billCenterService.syncBillCenter({ userId: 1, budgetId: 7 });

      expect(countCompletedAdjustmentSteps).toHaveBeenCalledWith({
        anchor: new Date("2026-01-01T00:00:00.000Z"),
        occurrenceDate: new Date("2026-10-05T00:00:00.000Z"),
        adjustmentIntervalId: 3,
        adjustmentIntervalCount: 1,
        adjustmentIntervalName: "monthly",
      });
      expect(applyReoccurrenceAmountAdjustment).toHaveBeenCalledWith(
        100,
        "STEP",
        "increase",
        5,
        2,
      );
      expect(prisma.billInstance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ amount: 90 }),
        }),
      );
    });

    it("honors a custom reminderDaysBefore when deriving statuses", async () => {
      prisma.reoccurrence.findMany.mockResolvedValue([reoccurrenceRow()]);
      prisma.billProfile.upsert.mockResolvedValue({
        id: 500,
        reminderDaysBefore: "14",
      });
      computeFirstNextOccurrenceDate.mockReturnValueOnce(
        new Date("2026-10-13T00:00:00.000Z"),
      );
      prisma.billInstance.findFirst.mockResolvedValue(null);

      await billCenterService.syncBillCenter({ userId: 1, budgetId: 7 });

      // 11 days out: UPCOMING with the default [7,3,1] but DUE_SOON with [14].
      expect(prisma.billInstance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: "DUE_SOON" }),
        }),
      );
    });

    it("skips occurrences beyond the clamped horizon", async () => {
      prisma.reoccurrence.findMany.mockResolvedValue([
        reoccurrenceRow({
          lastAt: new Date(dt.NOW.getTime() + 400 * dt.DAY_MS),
        }),
      ]);

      // 1000 requested -> clamped to 365 days, so a 400-day-out one-time bill is skipped.
      await billCenterService.syncBillCenter({
        userId: 1,
        budgetId: 7,
        horizonDays: 1000,
      });

      expect(prisma.billProfile.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.billInstance.upsert).not.toHaveBeenCalled();
    });
  });

  describe("getBillCenterSnapshot", () => {
    it("maps instance rows into snapshot items with counts, projections, and expected-range flags", async () => {
      prisma.billInstance.findMany.mockResolvedValue([
        billInstanceRow(),
        billInstanceRow({
          id: 202,
          status: "OVERDUE",
          amount: 50,
          billProfile: {
            ...billInstanceRow().billProfile,
            kind: "INCOME",
            payee: null,
            expectedAmountLow: 60,
            register: { id: 12, name: "Savings", latestBalance: 1000 },
            reoccurrence: { description: "Paycheck", amount: 200 },
          },
        }),
        billInstanceRow({
          id: 203,
          status: "PAID",
          paidAt: new Date("2026-10-01T00:00:00.000Z"),
          paidAmount: 120.5,
          note: "paid up",
          amount: 120.5,
          billProfile: {
            ...billInstanceRow().billProfile,
            expectedAmountHigh: 100,
          },
        }),
      ]);

      const result = await billCenterService.getBillCenterSnapshot({
        userId: 1,
        budgetId: 7,
      });

      // Sync ran first with a 120-day horizon.
      expect(prisma.reoccurrence.findMany).toHaveBeenCalled();
      expect(prisma.billInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            budgetId: 7,
            dueAt: {
              gte: new Date("2026-10-02T00:00:00.000Z"),
              lte: new Date(
                dt.NOW.getTime() + 120 * dt.DAY_MS,
              ),
            },
            billProfile: {
              isArchived: false,
              kind: { not: "INCOME" },
            },
          }),
          orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        }),
      );

      expect(result.counts).toEqual({
        overdue: 1,
        dueSoon: 1,
        dueToday: 0,
        upcoming: 0,
        paid: 1,
        skipped: 0,
        partial: 0,
      });

      expect(result.items).toHaveLength(3);

      // BILL subtracts from the projected balance.
      expect(result.items[0]).toEqual({
        id: 201,
        status: "DUE_SOON",
        dueAt: new Date("2026-10-05T00:00:00.000Z"),
        amount: 120,
        paidAt: null,
        paidAmount: null,
        note: null,
        projectedBalanceAfter: 880,
        isAmountOutOfExpectedRange: false,
        profile: {
          id: 500,
          kind: "BILL",
          payee: "Electric",
          isAutoPay: true,
          graceDays: 3,
          reminderDaysBefore: "7,3,1",
          priority: 1,
          reoccurrenceId: 5,
          register: { id: 11, name: "Checking", latestBalance: 1000 },
          description: "Electric bill",
          baseAmount: 115,
        },
      });

      // INCOME adds to the projected balance; below the expected low is flagged.
      expect(result.items[1]).toMatchObject({
        id: 202,
        projectedBalanceAfter: 1050,
        isAmountOutOfExpectedRange: true,
        profile: expect.objectContaining({
          kind: "INCOME",
          payee: null,
          description: "Paycheck",
          baseAmount: 200,
        }),
      });

      // Above the expected high is flagged too.
      expect(result.items[2]).toMatchObject({
        id: 203,
        paidAt: new Date("2026-10-01T00:00:00.000Z"),
        paidAmount: 120.5,
        note: "paid up",
        isAmountOutOfExpectedRange: true,
      });
    });

    it("passes an explicit from/to window and includeIncome through to the query", async () => {
      await billCenterService.getBillCenterSnapshot({
        userId: 1,
        budgetId: 7,
        from: "2026-10-01",
        to: "2026-10-31",
        includeIncome: true,
      });

      expect(prisma.billInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueAt: {
              gte: new Date("2026-10-01T00:00:00.000Z"),
              lte: new Date("2026-10-31T23:59:59.999Z"),
            },
            billProfile: { isArchived: false },
          }),
        }),
      );
    });

    it("throws 403 when the budget is not accessible", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        billCenterService.getBillCenterSnapshot({ userId: 1, budgetId: 7 }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("updateBillInstanceStatus", () => {
    const instance = billInstanceRow();

    it("throws 404 when the instance is not found for the user", async () => {
      prisma.billInstance.findFirst.mockResolvedValue(null);

      await expect(
        billCenterService.updateBillInstanceStatus({
          userId: 1,
          billInstanceId: 201,
          status: "PAID",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(prisma.billInstance.findFirst).toHaveBeenCalledWith({
        where: {
          id: 201,
          account: { userAccounts: { some: { userId: 1 } } },
        },
      });
    });

    it("records payment fields when marking an instance PAID, defaulting paidAmount to the amount due", async () => {
      prisma.billInstance.findFirst.mockResolvedValue(instance);
      prisma.billInstance.update.mockResolvedValue(instance);

      await billCenterService.updateBillInstanceStatus({
        userId: 1,
        billInstanceId: 201,
        status: "PAID",
      });

      expect(prisma.billInstance.update).toHaveBeenCalledWith({
        where: { id: 201 },
        data: {
          status: "PAID",
          note: null,
          paidAt: NOW,
          paidAmount: 120,
          paidRegisterEntryId: null,
        },
      });
    });

    it("records PARTIAL with explicit paidAmount and register entry", async () => {
      prisma.billInstance.findFirst.mockResolvedValue(instance);
      prisma.billInstance.update.mockResolvedValue(instance);

      await billCenterService.updateBillInstanceStatus({
        userId: 1,
        billInstanceId: 201,
        status: "PARTIAL",
        note: "half now",
        paidAmount: 40,
        paidRegisterEntryId: "entry-1",
      });

      expect(prisma.billInstance.update).toHaveBeenCalledWith({
        where: { id: 201 },
        data: {
          status: "PARTIAL",
          note: "half now",
          paidAt: NOW,
          paidAmount: 40,
          paidRegisterEntryId: "entry-1",
        },
      });
    });

    it("clears payment fields for non-payment statuses", async () => {
      prisma.billInstance.findFirst.mockResolvedValue(instance);
      prisma.billInstance.update.mockResolvedValue(instance);

      await billCenterService.updateBillInstanceStatus({
        userId: 1,
        billInstanceId: 201,
        status: "SKIPPED",
        note: "not this month",
      });

      expect(prisma.billInstance.update).toHaveBeenCalledWith({
        where: { id: 201 },
        data: {
          status: "SKIPPED",
          note: "not this month",
          paidAt: null,
          paidAmount: null,
          paidRegisterEntryId: null,
        },
      });
    });
  });

  describe("updateBillProfile", () => {
    it("throws 404 when the profile is not found for the user", async () => {
      prisma.billProfile.findMany.mockResolvedValue([]);

      await expect(
        billCenterService.updateBillProfile({
          userId: 1,
          billProfileId: 500,
          payee: "New",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(prisma.billProfile.update).not.toHaveBeenCalled();
    });

    it("writes only the provided fields and clamps graceDays at zero", async () => {
      prisma.billProfile.findMany.mockResolvedValue([{ id: 500 }]);
      prisma.billProfile.update.mockResolvedValue({ id: 500 });

      await billCenterService.updateBillProfile({
        userId: 1,
        billProfileId: 500,
        kind: "TRANSFER",
        payee: "Landlord",
        isAutoPay: false,
        graceDays: -3,
        expectedAmountLow: 90,
        expectedAmountHigh: 120,
        reminderDaysBefore: "5,2",
        priority: 2,
      });

      expect(prisma.billProfile.findMany).toHaveBeenCalledWith({
        where: {
          id: 500,
          account: { userAccounts: { some: { userId: 1 } } },
        },
        take: 1,
      });
      expect(prisma.billProfile.update).toHaveBeenCalledWith({
        where: { id: 500 },
        data: {
          kind: "TRANSFER",
          payee: "Landlord",
          isAutoPay: false,
          graceDays: 0,
          expectedAmountLow: 90,
          expectedAmountHigh: 120,
          reminderDaysBefore: "5,2",
          priority: 2,
        },
      });
    });

    it("updates with an empty data object when nothing is provided", async () => {
      prisma.billProfile.findMany.mockResolvedValue([{ id: 500 }]);
      prisma.billProfile.update.mockResolvedValue({ id: 500 });

      await billCenterService.updateBillProfile({
        userId: 1,
        billProfileId: 500,
      });

      expect(prisma.billProfile.update).toHaveBeenCalledWith({
        where: { id: 500 },
        data: {},
      });
    });

    it("allows explicitly clearing nullable fields", async () => {
      prisma.billProfile.findMany.mockResolvedValue([{ id: 500 }]);
      prisma.billProfile.update.mockResolvedValue({ id: 500 });

      await billCenterService.updateBillProfile({
        userId: 1,
        billProfileId: 500,
        payee: null,
        reminderDaysBefore: null,
      });

      expect(prisma.billProfile.update).toHaveBeenCalledWith({
        where: { id: 500 },
        data: { payee: null, reminderDaysBefore: null },
      });
    });
  });

  describe("evaluateBillReminders", () => {
    it("marks only overdue/due-today/due-soon instances as reminded and returns counts", async () => {
      prisma.billInstance.findMany.mockResolvedValue([
        billInstanceRow({ id: 1, status: "OVERDUE" }),
        billInstanceRow({ id: 2, status: "DUE_TODAY" }),
        billInstanceRow({ id: 3, status: "DUE_SOON" }),
        billInstanceRow({ id: 4, status: "UPCOMING" }),
        billInstanceRow({ id: 5, status: "PAID" }),
      ]);

      const result = await billCenterService.evaluateBillReminders({
        userId: 1,
        budgetId: 7,
      });

      expect(prisma.billInstance.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2, 3] } },
        data: { reminderLastSentAt: NOW },
      });
      expect(result).toEqual({
        remindedCount: 3,
        overdueCount: 1,
        dueSoonCount: 2,
      });
    });

    it("does not touch the database when nothing needs a reminder", async () => {
      prisma.billInstance.findMany.mockResolvedValue([
        billInstanceRow({ id: 6, status: "UPCOMING" }),
      ]);

      const result = await billCenterService.evaluateBillReminders({
        userId: 1,
        budgetId: 7,
      });

      expect(prisma.billInstance.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        remindedCount: 0,
        overdueCount: 0,
        dueSoonCount: 0,
      });
    });
  });

  describe("evaluateBillRemindersForAllBudgets", () => {
    it("evaluates reminders per budget using the first account user and skips budgets without users", async () => {
      prisma.budget.findMany.mockResolvedValue([
        { id: 7, account: { userAccounts: [{ userId: 1 }] } },
        { id: 8, account: { userAccounts: [] } },
      ]);
      prisma.billInstance.findMany.mockResolvedValue([
        billInstanceRow({ id: 1, status: "OVERDUE" }),
        billInstanceRow({ id: 2, status: "DUE_SOON" }),
      ]);

      const result =
        await billCenterService.evaluateBillRemindersForAllBudgets();

      expect(prisma.budget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: false }),
        }),
      );
      expect(result.budgetCount).toBe(2);
      expect(result.processedCount).toBe(1);
      expect(result.failures).toEqual([]);
      expect(result.results).toEqual([
        {
          budgetId: 7,
          userId: 1,
          remindedCount: 2,
          overdueCount: 1,
          dueSoonCount: 1,
        },
      ]);
    });

    it("collects per-budget failures without aborting the run", async () => {
      prisma.budget.findMany.mockResolvedValue([
        { id: 7, account: { userAccounts: [{ userId: 1 }] } },
        { id: 9, account: { userAccounts: [{ userId: 2 }] } },
      ]);
      prisma.billInstance.findMany
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce([]);

      const result =
        await billCenterService.evaluateBillRemindersForAllBudgets();

      expect(result.budgetCount).toBe(2);
      expect(result.processedCount).toBe(1);
      expect(result.failures).toEqual([{ budgetId: 7, error: "boom" }]);
      expect(result.results).toEqual([
        {
          budgetId: 9,
          userId: 2,
          remindedCount: 0,
          overdueCount: 0,
          dueSoonCount: 0,
        },
      ]);
    });
  });
});
