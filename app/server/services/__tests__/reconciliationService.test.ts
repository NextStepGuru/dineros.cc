import { beforeEach, describe, expect, it, vi } from "vitest";

import * as reconciliationService from "../reconciliationService";

// The service imports clients/services that must not reach the network or DB.
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    parseInput: vi.fn((input: string) => ({
      toDate: () => new Date(input),
    })),
    startOf: vi.fn((_unit: string, input: string) => ({
      toDate: () => new Date(`${input}T00:00:00.000Z`),
    })),
    endOf: vi.fn((_unit: string, input: string) => ({
      toDate: () => new Date(`${input}T23:59:59.999Z`),
    })),
    toDate: vi.fn((input?: string | Date) => {
      if (input === undefined) return new Date("2024-01-01T00:00:00.000Z");
      return input instanceof Date ? input : new Date(input);
    }),
  },
}));

vi.mock("~/server/services/merchantCategoryRuleService", () => ({
  upsertMerchantCategoryRuleFromUserEdit: vi.fn(),
}));

vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
}));

vi.mock("~/server/services/statementMatchService", () => ({
  ledgerOnlyHint: vi.fn(() => "likely_transfer"),
  loadTransferRecurrenceIds: vi.fn(async () => new Set<number>()),
  matchStatementLinesForPeriod: vi.fn(async () => ({ matched: 2 })),
}));

let prisma: any;

beforeEach(async () => {
  vi.clearAllMocks();
  ({ prisma } = await import("~/server/clients/prismaClient"));
  // Default access checks pass; individual tests override with mockResolvedValue.
  prisma.budget.findFirst.mockResolvedValue({ id: 7, accountId: "acct-1" });
  prisma.accountRegister.findFirst.mockResolvedValue({
    id: 11,
    name: "Checking",
    accountId: "acct-1",
    budgetId: 7,
  });
});

function periodRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 501,
    accountId: "acct-1",
    budgetId: 7,
    accountRegisterId: 11,
    status: "OPEN",
    startDate: new Date("2024-06-01T00:00:00.000Z"),
    endDate: new Date("2024-06-30T23:59:59.999Z"),
    statementOpeningBalance: 1000,
    statementEndingBalance: 1100,
    statementIncomeTotal: null,
    statementExpenseTotal: null,
    ledgerClearedBalance: null,
    differenceAmount: null,
    closeNote: null,
    closedAt: null,
    closedByUserId: null,
    closingAdjustmentEntryId: null,
    updatedAt: new Date("2024-06-30T12:00:00.000Z"),
    register: { id: 11, name: "Checking" },
    ...overrides,
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  const entry: Record<string, unknown> = {
    id: "e1",
    createdAt: new Date("2024-06-05T10:00:00.000Z"),
    description: "Coffee",
    amount: -5,
    balance: 995,
    isCleared: false,
    isReconciled: false,
    isProjected: false,
    isPending: false,
    reoccurrenceId: null,
    sourceAccountRegisterId: null,
    categoryId: "cat-1",
    plaidJson: null,
  };
  const row: Record<string, unknown> = {
    id: 9001,
    reconciliationPeriodId: 501,
    registerEntryId: "e1",
    isCleared: false,
    clearedAt: null,
    note: null,
    ...overrides,
  };
  row.registerEntry = { ...entry, ...((overrides as any).registerEntry ?? {}) };
  delete row.registerEntryOverrides;
  return row;
}

function lineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7001,
    reconciliationPeriodId: 501,
    postedAt: new Date("2024-06-05T00:00:00.000Z"),
    description: "STARBUCKS STORE",
    amount: -5,
    lineType: null,
    matchStatus: "unmatched",
    registerEntryId: null,
    matchConfidence: null,
    matchReason: null,
    ignoredAt: null,
    sortIndex: 0,
    ...overrides,
  };
}

/** Queue reconciliationPeriod.findFirst results: [period, lastClosed] per workspace build. */
function mockWorkspaceLookups(
  period: Record<string, unknown> | null,
  lastClosed: Record<string, unknown> | null = null,
  iterations = 1,
) {
  for (let i = 0; i < iterations; i += 1) {
    prisma.reconciliationPeriod.findFirst.mockResolvedValueOnce(period);
    prisma.reconciliationPeriod.findFirst.mockResolvedValueOnce(lastClosed);
  }
}

describe("reconciliationService", () => {
  describe("getLastClosedReconciliationPeriod", () => {
    it("throws 403 when the user cannot access the budget", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.getLastClosedReconciliationPeriod({
          userId: 1,
          budgetId: 7,
          accountRegisterId: 11,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws 404 when the register is not in the budget", async () => {
      prisma.accountRegister.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.getLastClosedReconciliationPeriod({
          userId: 1,
          budgetId: 7,
          accountRegisterId: 11,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns null when no closed period exists", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);

      const result =
        await reconciliationService.getLastClosedReconciliationPeriod({
          userId: 1,
          budgetId: 7,
          accountRegisterId: 11,
        });

      expect(result).toBeNull();
      expect(prisma.reconciliationPeriod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "CLOSED" }),
          orderBy: { endDate: "desc" },
        }),
      );
    });

    it("returns the id, endDate, and numeric ending balance of the last closed period", async () => {
      const closed = periodRow({
        status: "CLOSED",
        statementEndingBalance: 1100.5,
      });
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(closed);

      const result =
        await reconciliationService.getLastClosedReconciliationPeriod({
          userId: 1,
          budgetId: 7,
          accountRegisterId: 11,
        });

      expect(result).toEqual({
        id: 501,
        endDate: closed.endDate,
        statementEndingBalance: 1100.5,
      });
    });
  });

  describe("openReconciliationPeriod", () => {
    const baseParams = {
      userId: 1,
      budgetId: 7,
      accountRegisterId: 11,
      startDate: "2024-06-01",
      endDate: "2024-06-30",
      statementOpeningBalance: 1000,
      statementEndingBalance: 1100,
    };

    it("throws 403 without budget access", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.openReconciliationPeriod(baseParams),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws 404 when the register is missing", async () => {
      prisma.accountRegister.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.openReconciliationPeriod(baseParams),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("returns the existing open period without creating a new one", async () => {
      const existing = periodRow();
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(existing);

      const result = await reconciliationService.openReconciliationPeriod(
        baseParams,
      );

      expect(result).toBe(existing);
      expect(prisma.reconciliationPeriod.create).not.toHaveBeenCalled();
    });

    it("creates an OPEN period with rounded balances and snapshots ledger entries", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);
      const created = periodRow({ id: 502 });
      prisma.reconciliationPeriod.create.mockResolvedValue(created);
      prisma.registerEntry.findMany.mockResolvedValue([
        {
          id: "e1",
          isCleared: true,
          updatedAt: new Date("2024-06-06T00:00:00.000Z"),
        },
        { id: "e2", isCleared: false, updatedAt: new Date("2024-06-07T00:00:00.000Z") },
      ]);

      const result = await reconciliationService.openReconciliationPeriod({
        ...baseParams,
        statementOpeningBalance: 1000.126,
        statementEndingBalance: 1100.134,
      });

      expect(result).toBe(created);
      expect(prisma.reconciliationPeriod.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: "acct-1",
          budgetId: 7,
          accountRegisterId: 11,
          status: "OPEN",
          startDate: new Date("2024-06-01T00:00:00.000Z"),
          endDate: new Date("2024-06-30T23:59:59.999Z"),
          statementOpeningBalance: 1000.13,
          statementEndingBalance: 1100.13,
          statementIncomeTotal: null,
          statementExpenseTotal: null,
        }),
        include: { register: { select: { id: true, name: true } } },
      });
      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith({
        where: {
          accountRegisterId: 11,
          createdAt: {
            gte: new Date("2024-06-01T00:00:00.000Z"),
            lte: new Date("2024-06-30T23:59:59.999Z"),
          },
          isBalanceEntry: false,
        },
        select: { id: true, isCleared: true, updatedAt: true },
      });
      expect(prisma.reconciliationItem.createMany).toHaveBeenCalledWith({
        data: [
          {
            reconciliationPeriodId: 502,
            registerEntryId: "e1",
            isCleared: true,
            clearedAt: new Date("2024-06-06T00:00:00.000Z"),
          },
          {
            reconciliationPeriodId: 502,
            registerEntryId: "e2",
            isCleared: false,
            clearedAt: null,
          },
        ],
        skipDuplicates: true,
      });
      expect(prisma.statementLine.create).not.toHaveBeenCalled();
      const { matchStatementLinesForPeriod } = await import(
        "~/server/services/statementMatchService"
      );
      expect(matchStatementLinesForPeriod).not.toHaveBeenCalled();
    });

    it("persists statement lines and runs the matcher when lines are provided", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);
      prisma.reconciliationPeriod.create.mockResolvedValue(periodRow());
      prisma.registerEntry.findMany.mockResolvedValue([]);
      const { matchStatementLinesForPeriod } = await import(
        "~/server/services/statementMatchService"
      );
      (matchStatementLinesForPeriod as any).mockClear();

      await reconciliationService.openReconciliationPeriod({
        ...baseParams,
        statementLines: [
          { date: "2024-06-05", description: "A".repeat(2000), amount: -5.123 },
          {
            date: "2024-06-06",
            description: "Short",
            amount: 10,
            lineType: "POS",
          },
        ],
      });

      expect(prisma.statementLine.create).toHaveBeenCalledTimes(2);
      const first = prisma.statementLine.create.mock.calls[0][0];
      expect(first.data).toMatchObject({
        reconciliationPeriodId: 501,
        description: "A".repeat(1500),
        amount: -5.12,
        lineType: null,
        matchStatus: "unmatched",
        sortIndex: 0,
      });
      expect(first.data.postedAt).toEqual(new Date("2024-06-05"));
      const second = prisma.statementLine.create.mock.calls[1][0];
      expect(second.data.lineType).toBe("POS");
      expect(second.data.sortIndex).toBe(1);
      expect(matchStatementLinesForPeriod).toHaveBeenCalledWith({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });
    });

    it("rounds optional income/expense totals when provided", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);
      prisma.reconciliationPeriod.create.mockResolvedValue(periodRow());
      prisma.registerEntry.findMany.mockResolvedValue([]);

      await reconciliationService.openReconciliationPeriod({
        ...baseParams,
        statementIncomeTotal: 200.456,
        statementExpenseTotal: -100.452,
      });

      expect(prisma.reconciliationPeriod.create.mock.calls[0][0].data).toMatchObject({
        statementIncomeTotal: 200.46,
        statementExpenseTotal: -100.45,
      });
    });

    it("skips item snapshotting when the register has no entries in range", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);
      prisma.reconciliationPeriod.create.mockResolvedValue(periodRow());
      prisma.registerEntry.findMany.mockResolvedValue([]);

      await reconciliationService.openReconciliationPeriod(baseParams);

      expect(prisma.reconciliationItem.createMany).not.toHaveBeenCalled();
    });
  });

  describe("getReconciliationPeriodWorkspace", () => {
    it("throws 404 when the period is not found for the user", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.getReconciliationPeriodWorkspace({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("computes cleared balance, difference, buckets, hints, and continuity", async () => {
      const period = periodRow({
        statementIncomeTotal: 200,
        statementExpenseTotal: -100,
      });
      mockWorkspaceLookups(period, periodRow({ id: 400, status: "CLOSED", statementEndingBalance: 950 }));

      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e1",
          isCleared: true,
          clearedAt: new Date("2024-06-06T00:00:00.000Z"),
          registerEntry: { amount: 150, description: "Deposit" },
        }),
        itemRow({
          id: 9002,
          registerEntryId: "e2",
          registerEntry: { amount: -30, description: "Gas", categoryId: "cat-2" },
        }),
        itemRow({
          id: 9003,
          registerEntryId: "e4",
          registerEntry: { amount: -25, description: "Coffee 2" },
        }),
      ]);
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          matchStatus: "matched",
          registerEntryId: "e1",
          amount: 150,
        }),
        lineRow({ id: 7002, matchStatus: "statement_only", amount: 7 }),
        lineRow({
          id: 7003,
          matchStatus: "ignored",
          ignoredAt: new Date("2024-06-07T00:00:00.000Z"),
        }),
        lineRow({
          id: 7004,
          matchStatus: "conflict",
          registerEntryId: "e2",
          amount: -35,
        }),
      ]);

      const workspace =
        await reconciliationService.getReconciliationPeriodWorkspace({
          userId: 1,
          periodId: 501,
        });

      expect(workspace.period.ledgerClearedBalance).toBe(1150);
      expect(workspace.period.clearedAmountSum).toBe(150);
      expect(workspace.period.differenceAmount).toBe(-50);

      expect(workspace.buckets.matched).toHaveLength(1);
      expect(workspace.buckets.matched[0].item.registerEntryId).toBe("e1");
      expect(workspace.buckets.statementOnly).toHaveLength(1);
      expect(workspace.buckets.statementOnly[0].amount).toBe(7);
      expect(workspace.buckets.conflicts).toHaveLength(1);
      expect(workspace.buckets.conflicts[0].item.registerEntryId).toBe("e2");
      expect(workspace.buckets.ignored).toHaveLength(1);
      expect(workspace.buckets.ledgerOnly.map((i: any) => i.item.registerEntryId)).toEqual([
        "e2",
        "e4",
      ]);
      expect(workspace.buckets.ledgerOnly[0].hint).toBe("likely_transfer");

      expect(workspace.discrepancyHints.hasDifference).toBe(true);
      expect(workspace.discrepancyHints.possibleSignMismatchCount).toBe(2);
      expect(workspace.discrepancyHints.nearMatchEntryId).toBeNull();
      expect(workspace.discrepancyHints.possibleWrongSignEntryId).toBe("e4");
      expect(workspace.discrepancyHints.incomeSubtotalDelta).toBe(50);
      expect(workspace.discrepancyHints.expenseSubtotalDelta).toBe(-100);

      expect(workspace.openingContinuity).toEqual({
        previousEnding: 950,
        expectedOpening: 950,
        matches: false,
      });

      const deposit = workspace.items.find(
        (i: any) => i.registerEntryId === "e1",
      );
      expect(deposit.entry.amount).toBe(150);
      expect(deposit.isCleared).toBe(true);
    });

    it("reports a near-match hint for an uncleared entry within 2 cents of the difference", async () => {
      const period = periodRow({
        statementOpeningBalance: 1000,
        statementEndingBalance: 1030,
      });
      mockWorkspaceLookups(period, null);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e9",
          registerEntry: { amount: 30.01, description: "Mystery credit" },
        }),
      ]);
      prisma.statementLine.findMany.mockResolvedValue([]);

      const workspace =
        await reconciliationService.getReconciliationPeriodWorkspace({
          userId: 1,
          periodId: 501,
        });

      // difference = 1030 - 1000 = 30; sign match and |30.01 - 30| = 0.01 <= 2
      expect(workspace.discrepancyHints.nearMatchEntryId).toBe("e9");
      expect(workspace.openingContinuity).toBeNull();
    });

    it("maps statement line decimals to numbers and preserves null confidence", async () => {
      mockWorkspaceLookups(periodRow(), null);
      prisma.reconciliationItem.findMany.mockResolvedValue([]);
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({
          matchStatus: "matched",
          registerEntryId: "e1",
          amount: 42.5,
          matchConfidence: 0.95,
        }),
        lineRow({ id: 7002, matchConfidence: null }),
      ]);

      const workspace =
        await reconciliationService.getReconciliationPeriodWorkspace({
          userId: 1,
          periodId: 501,
        });

      const [matched, unmatched] = workspace.statementLines;
      expect(matched.amount).toBe(42.5);
      expect(matched.matchConfidence).toBe(0.95);
      expect(unmatched.matchConfidence).toBeNull();
      expect(workspace.period.differenceAmount).toBe(100);
      expect(workspace.buckets.ledgerOnly).toHaveLength(0);
    });
  });

  describe("getOpenReconciliationPeriod", () => {
    it("queries the OPEN period for the register and returns it", async () => {
      const open = periodRow();
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(open);

      const result = await reconciliationService.getOpenReconciliationPeriod({
        userId: 1,
        budgetId: 7,
        accountRegisterId: 11,
      });

      expect(result).toBe(open);
      expect(prisma.reconciliationPeriod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            budgetId: 7,
            accountRegisterId: 11,
            status: "OPEN",
          }),
          orderBy: { id: "desc" },
        }),
      );
    });

    it("returns null when nothing is open", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);

      const result = await reconciliationService.getOpenReconciliationPeriod({
        userId: 1,
        budgetId: 7,
        accountRegisterId: 11,
      });

      expect(result).toBeNull();
    });
  });

  describe("getReconciliationSetup", () => {
    it("combines the open period and the last closed period", async () => {
      const open = periodRow();
      const closed = periodRow({ id: 400, status: "CLOSED" });
      prisma.reconciliationPeriod.findFirst
        .mockResolvedValueOnce(open)
        .mockResolvedValueOnce(closed);

      const result = await reconciliationService.getReconciliationSetup({
        userId: 1,
        budgetId: 7,
        accountRegisterId: 11,
      });

      expect(result.open).toBe(open);
      expect(result.lastClosed.statementEndingBalance).toBe(1100);
    });
  });

  describe("rematchReconciliationPeriod", () => {
    it("throws 400 when the period is already closed", async () => {
      mockWorkspaceLookups(periodRow({ status: "CLOSED" }), null);

      await expect(
        reconciliationService.rematchReconciliationPeriod({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("resets unresolved lines and re-runs the matcher", async () => {
      mockWorkspaceLookups(periodRow(), null);
      prisma.reconciliationItem.findMany.mockResolvedValue([]);
      prisma.statementLine.findMany.mockResolvedValue([]);
      const { matchStatementLinesForPeriod } = await import(
        "~/server/services/statementMatchService"
      );

      const result = await reconciliationService.rematchReconciliationPeriod({
        userId: 1,
        periodId: 501,
      });

      expect(result).toEqual({ matched: 2 });
      expect(prisma.statementLine.updateMany).toHaveBeenCalledWith({
        where: {
          reconciliationPeriodId: 501,
          matchStatus: { in: ["statement_only", "unmatched", "conflict"] },
        },
        data: {
          matchStatus: "unmatched",
          registerEntryId: null,
          matchConfidence: null,
          matchReason: null,
        },
      });
      expect(matchStatementLinesForPeriod).toHaveBeenCalledWith({
        periodId: 501,
        userId: 1,
        accountId: "acct-1",
      });
    });
  });

  describe("updateReconciliationItem", () => {
    function mockOpenItem(overrides: Record<string, unknown> = {}) {
      return itemRow({
        registerEntry: {
          id: "e1",
          isReconciled: false,
          plaidJson: { merchant_name: "Shell" },
        },
        ...overrides,
      });
    }

    it("throws 404 when no open item exists for the entry", async () => {
      prisma.reconciliationItem.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.updateReconciliationItem({
          userId: 1,
          registerEntryId: "e1",
          isCleared: true,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("clears the item and its register entry", async () => {
      const item = mockOpenItem();
      prisma.reconciliationItem.findFirst.mockResolvedValue(item);
      prisma.reconciliationItem.update.mockResolvedValue({
        ...item,
        isCleared: true,
      });
      prisma.registerEntry.update.mockResolvedValue({});

      const updated = await reconciliationService.updateReconciliationItem({
        userId: 1,
        registerEntryId: "e1",
        isCleared: true,
      });

      expect(updated.isCleared).toBe(true);
      expect(prisma.reconciliationItem.update).toHaveBeenCalledWith({
        where: { id: 9001 },
        data: expect.objectContaining({ isCleared: true, clearedAt: expect.any(Date) }),
      });
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: { isCleared: true, isPending: true },
      });
      const itemData = prisma.reconciliationItem.update.mock.calls[0][0].data;
      expect("note" in itemData).toBe(false);
    });

    it("keeps isPending for already reconciled entries", async () => {
      const item = mockOpenItem({
        registerEntry: { id: "e1", isReconciled: true, plaidJson: null },
      });
      prisma.reconciliationItem.findFirst.mockResolvedValue(item);
      prisma.reconciliationItem.update.mockResolvedValue(item);
      prisma.registerEntry.update.mockResolvedValue({});

      await reconciliationService.updateReconciliationItem({
        userId: 1,
        registerEntryId: "e1",
        isCleared: false,
      });

      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: { isCleared: false, isPending: true },
      });
    });

    it("falls back to the existing cleared state when isCleared is omitted", async () => {
      const item = mockOpenItem();
      prisma.reconciliationItem.findFirst.mockResolvedValue(item);
      prisma.reconciliationItem.update.mockResolvedValue(item);
      prisma.registerEntry.update.mockResolvedValue({});

      await reconciliationService.updateReconciliationItem({
        userId: 1,
        registerEntryId: "e1",
        note: "checked",
      });

      const itemData = prisma.reconciliationItem.update.mock.calls[0][0].data;
      expect(itemData.isCleared).toBe(false);
      expect(itemData.clearedAt).toBeNull();
      expect(itemData.note).toBe("checked");
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: { isCleared: false, isPending: false },
      });
    });

    it("validates the category against the period account and locks it on the entry", async () => {
      const item = mockOpenItem();
      prisma.reconciliationItem.findFirst.mockResolvedValue(item);
      prisma.reconciliationItem.update.mockResolvedValue(item);
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.category.findFirst.mockResolvedValue({ id: "cat-9" });
      prisma.registerEntry.update.mockResolvedValue({});
      const { upsertMerchantCategoryRuleFromUserEdit } = await import(
        "~/server/services/merchantCategoryRuleService"
      );

      await reconciliationService.updateReconciliationItem({
        userId: 1,
        registerEntryId: "e1",
        categoryId: "cat-9",
      });

      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: {
          isCleared: false,
          isPending: false,
          categoryId: "cat-9",
          categoryLocked: true,
          categorySource: "user",
        },
      });
      expect(upsertMerchantCategoryRuleFromUserEdit).toHaveBeenCalledWith({
        accountId: "acct-1",
        categoryId: "cat-9",
        plaidJson: { merchant_name: "Shell" },
      });
    });

    it("allows clearing a category with null and skips the rule upsert effect", async () => {
      const item = mockOpenItem();
      prisma.reconciliationItem.findFirst.mockResolvedValue(item);
      prisma.reconciliationItem.update.mockResolvedValue(item);
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.registerEntry.update.mockResolvedValue({});
      const { upsertMerchantCategoryRuleFromUserEdit } = await import(
        "~/server/services/merchantCategoryRuleService"
      );

      await reconciliationService.updateReconciliationItem({
        userId: 1,
        registerEntryId: "e1",
        categoryId: null,
      });

      // Service still delegates, but the rule upsert is a no-op for null categories.
      expect(upsertMerchantCategoryRuleFromUserEdit).toHaveBeenCalledWith({
        accountId: "acct-1",
        categoryId: null,
        plaidJson: { merchant_name: "Shell" },
      });
      expect(prisma.category.findFirst).not.toHaveBeenCalled();
      expect(prisma.registerEntry.update).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: expect.objectContaining({ categoryId: null, categoryLocked: true }),
      });
    });

    it("throws 400 when the category does not belong to the account", async () => {
      const item = mockOpenItem();
      prisma.reconciliationItem.findFirst.mockResolvedValue(item);
      prisma.reconciliationItem.update.mockResolvedValue(item);
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.category.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.updateReconciliationItem({
          userId: 1,
          registerEntryId: "e1",
          categoryId: "cat-404",
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws 404 when the period row disappeared before category validation", async () => {
      const item = mockOpenItem();
      prisma.reconciliationItem.findFirst.mockResolvedValue(item);
      prisma.reconciliationItem.update.mockResolvedValue(item);
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.updateReconciliationItem({
          userId: 1,
          registerEntryId: "e1",
          categoryId: "cat-9",
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("updateStatementLine", () => {
    it("throws 404 when the statement line does not exist", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.updateStatementLine({
          userId: 1,
          statementLineId: 7001,
          ignore: true,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 404 when the period is not accessible to the user", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(lineRow());
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.updateStatementLine({
          userId: 1,
          statementLineId: 7001,
          ignore: true,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 400 when the period is closed", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(lineRow());
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(
        periodRow({ status: "CLOSED" }),
      );

      await expect(
        reconciliationService.updateStatementLine({
          userId: 1,
          statementLineId: 7001,
          ignore: true,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Reconciliation period is already closed",
      });
    });

    it("refuses ledger creation for already-matched lines", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(
        lineRow({ matchStatus: "matched", registerEntryId: "e1" }),
      );
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());

      await expect(
        reconciliationService.updateStatementLine({
          userId: 1,
          statementLineId: 7001,
          createLedgerEntry: true,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("creates a cleared manual ledger entry from a statement line and queues recalculation", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(
        lineRow({ matchStatus: "statement_only", amount: -12.345 }),
      );
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.registerEntry.create.mockResolvedValue({ id: "new-entry" });
      const { addRecalculateJob } = await import("~/server/clients/queuesClient");

      const result = await reconciliationService.updateStatementLine({
        userId: 1,
        statementLineId: 7001,
        createLedgerEntry: true,
      });

      expect(result).toEqual({
        registerEntryId: "new-entry",
        statementLineId: 7001,
      });
      expect(prisma.registerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountRegisterId: 11,
            description: "STARBUCKS STORE",
            amount: -12.34,
            balance: 0,
            isCleared: true,
            isPending: true,
            isBalanceEntry: false,
            isManualEntry: true,
            hasBalanceReCalc: true,
          }),
        }),
      );
      expect(prisma.reconciliationItem.create).toHaveBeenCalledWith({
        data: {
          reconciliationPeriodId: 501,
          registerEntryId: "new-entry",
          isCleared: true,
          clearedAt: expect.any(Date),
        },
      });
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 7001 },
        data: {
          matchStatus: "matched",
          registerEntryId: "new-entry",
          matchConfidence: 1,
          matchReason: "Added to ledger from statement",
          ignoredAt: null,
        },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "acct-1" });
    });

    it("ignores a line and stamps the ignore time", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(lineRow());
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      const ignoredRow = lineRow({ matchStatus: "ignored" });
      prisma.statementLine.update.mockResolvedValue(ignoredRow);

      const result = await reconciliationService.updateStatementLine({
        userId: 1,
        statementLineId: 7001,
        ignore: true,
      });

      expect(result).toBe(ignoredRow);
      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 7001 },
        data: {
          matchStatus: "ignored",
          ignoredAt: expect.any(Date),
          matchReason: "Ignored for this period",
        },
      });
    });

    it("un-ignores a line back to statement_only", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(
        lineRow({ matchStatus: "ignored" }),
      );
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.update.mockResolvedValue(lineRow());

      await reconciliationService.updateStatementLine({
        userId: 1,
        statementLineId: 7001,
        ignore: false,
      });

      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 7001 },
        data: {
          matchStatus: "statement_only",
          ignoredAt: null,
          registerEntryId: null,
          matchReason: "No ledger match",
        },
      });
    });

    it("unmatches a line and un-clears its cleared, unreconciled item", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(
        lineRow({ matchStatus: "matched", registerEntryId: "e1" }),
      );
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.update.mockResolvedValue(lineRow());
      // 1st: item lookup for the unmatch, 2nd: inside updateReconciliationItem
      prisma.reconciliationItem.findFirst
        .mockResolvedValueOnce(
          itemRow({
            isCleared: true,
            registerEntry: { id: "e1", isReconciled: false, plaidJson: null },
          }),
        )
        .mockResolvedValueOnce(
          itemRow({
            isCleared: true,
            registerEntry: { id: "e1", isReconciled: false, plaidJson: null },
          }),
        );
      prisma.reconciliationItem.update.mockResolvedValue(itemRow());
      prisma.registerEntry.update.mockResolvedValue({});

      await reconciliationService.updateStatementLine({
        userId: 1,
        statementLineId: 7001,
        registerEntryId: null,
      });

      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 7001 },
        data: {
          matchStatus: "statement_only",
          registerEntryId: null,
          matchConfidence: null,
          matchReason: "Unmatched by user",
        },
      });
      expect(prisma.reconciliationItem.update).toHaveBeenCalledWith({
        where: { id: 9001 },
        data: expect.objectContaining({ isCleared: false, clearedAt: null }),
      });
    });

    it("does not un-clear a reconciled entry when unmatching", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(
        lineRow({ matchStatus: "matched", registerEntryId: "e1" }),
      );
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.update.mockResolvedValue(lineRow());
      prisma.reconciliationItem.findFirst.mockResolvedValue(
        itemRow({
          isCleared: true,
          registerEntry: { id: "e1", isReconciled: true, plaidJson: null },
        }),
      );

      await reconciliationService.updateStatementLine({
        userId: 1,
        statementLineId: 7001,
        registerEntryId: null,
      });

      expect(prisma.reconciliationItem.update).not.toHaveBeenCalled();
    });

    it("throws 404 when the manually matched entry is not in the period", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(lineRow());
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.reconciliationItem.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.updateStatementLine({
          userId: 1,
          statementLineId: 7001,
          registerEntryId: "e404",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: "Ledger entry is not in this period",
      });
    });

    it("matches a line to a ledger entry by hand and clears the item", async () => {
      prisma.statementLine.findFirst.mockResolvedValue(lineRow());
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.update.mockResolvedValue(lineRow());
      prisma.reconciliationItem.findFirst
        .mockResolvedValueOnce(itemRow({ isCleared: false }))
        .mockResolvedValueOnce(itemRow({ isCleared: false }));
      prisma.reconciliationItem.update.mockResolvedValue(itemRow());
      prisma.registerEntry.update.mockResolvedValue({});

      await reconciliationService.updateStatementLine({
        userId: 1,
        statementLineId: 7001,
        registerEntryId: "e1",
      });

      expect(prisma.statementLine.update).toHaveBeenCalledWith({
        where: { id: 7001 },
        data: {
          matchStatus: "matched",
          registerEntryId: "e1",
          matchConfidence: 1,
          matchReason: "Matched by user",
          ignoredAt: null,
        },
      });
      expect(prisma.reconciliationItem.update).toHaveBeenCalledWith({
        where: { id: 9001 },
        data: expect.objectContaining({ isCleared: true }),
      });
    });

    it("returns the line untouched when no relevant flag is set", async () => {
      const line = lineRow();
      prisma.statementLine.findFirst.mockResolvedValue(line);
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());

      const result = await reconciliationService.updateStatementLine({
        userId: 1,
        statementLineId: 7001,
      });

      expect(result).toBe(line);
      expect(prisma.statementLine.update).not.toHaveBeenCalled();
    });
  });

  describe("importStatementLinesToLedger", () => {
    function importableLines() {
      return [
        lineRow({ id: 1, matchStatus: "statement_only" }),
        lineRow({ id: 2, matchStatus: "matched", registerEntryId: "e1" }),
        lineRow({ id: 3, matchStatus: "ignored" }),
        lineRow({
          id: 4,
          matchStatus: "statement_only",
          ignoredAt: new Date("2024-06-08T00:00:00.000Z"),
        }),
        lineRow({ id: 5, matchStatus: "unmatched", amount: 3.5 }),
      ];
    }

    it("throws 404 when the period is not accessible", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.importStatementLinesToLedger({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 400 when the period is closed", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(
        periodRow({ status: "CLOSED" }),
      );

      await expect(
        reconciliationService.importStatementLinesToLedger({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("imports only importable lines and queues one recalculation", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.findMany.mockResolvedValue(importableLines());
      prisma.registerEntry.create.mockResolvedValue({ id: "created" });
      const { addRecalculateJob } = await import("~/server/clients/queuesClient");
      addRecalculateJob.mockClear();

      const result = await reconciliationService.importStatementLinesToLedger({
        userId: 1,
        periodId: 501,
      });

      expect(result.created).toBe(2);
      expect(result.registerEntryIds).toHaveLength(2);
      expect(prisma.registerEntry.create).toHaveBeenCalledTimes(2);
      expect(addRecalculateJob).toHaveBeenCalledTimes(1);
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "acct-1" });
    });

    it("imports nothing and skips the recalculation queue when no line is importable", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({ id: 2, matchStatus: "matched", registerEntryId: "e1" }),
      ]);
      const { addRecalculateJob } = await import("~/server/clients/queuesClient");
      addRecalculateJob.mockClear();

      const result = await reconciliationService.importStatementLinesToLedger({
        userId: 1,
        periodId: 501,
      });

      expect(result.created).toBe(0);
      expect(prisma.registerEntry.create).not.toHaveBeenCalled();
      expect(addRecalculateJob).not.toHaveBeenCalled();
    });

    it("throws 400 when an explicitly requested line cannot be imported", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.findMany.mockResolvedValue(importableLines());

      await expect(
        reconciliationService.importStatementLinesToLedger({
          userId: 1,
          periodId: 501,
          statementLineIds: [1, 2],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        statusMessage:
          "Some statement lines cannot be added (already matched, ignored, or not in this period).",
      });
      expect(prisma.registerEntry.create).not.toHaveBeenCalled();
    });

    it("throws 400 when an explicitly requested line is not in the period", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.findMany.mockResolvedValue(importableLines());

      await expect(
        reconciliationService.importStatementLinesToLedger({
          userId: 1,
          periodId: 501,
          statementLineIds: [1, 999],
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("honors an explicit subset of importable lines", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(periodRow());
      prisma.statementLine.findMany.mockResolvedValue(importableLines());
      prisma.registerEntry.create.mockResolvedValue({ id: "created" });
      const { addRecalculateJob } = await import("~/server/clients/queuesClient");
      addRecalculateJob.mockClear();

      const result = await reconciliationService.importStatementLinesToLedger({
        userId: 1,
        periodId: 501,
        statementLineIds: [5],
      });

      expect(result.created).toBe(1);
      expect(prisma.registerEntry.create).toHaveBeenCalledTimes(1);
      expect(addRecalculateJob).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateReconciliationPeriodBalances", () => {
    it("throws 400 for closed periods", async () => {
      mockWorkspaceLookups(periodRow({ status: "CLOSED" }), null);

      await expect(
        reconciliationService.updateReconciliationPeriodBalances({
          userId: 1,
          periodId: 501,
          statementOpeningBalance: 1000,
          statementEndingBalance: 1100,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("updates the statement balances and returns a fresh workspace", async () => {
      mockWorkspaceLookups(periodRow(), null, 2);
      prisma.reconciliationItem.findMany.mockResolvedValue([]);
      prisma.statementLine.findMany.mockResolvedValue([]);
      prisma.reconciliationPeriod.update.mockResolvedValue(periodRow());

      const workspace =
        await reconciliationService.updateReconciliationPeriodBalances({
          userId: 1,
          periodId: 501,
          statementOpeningBalance: 995.111,
          statementEndingBalance: 1200.555,
        });

      expect(prisma.reconciliationPeriod.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: {
          statementOpeningBalance: 995.11,
          statementEndingBalance: 1200.56,
        },
      });
      expect(workspace.period.statementOpeningBalance).toBe(1000);
      expect(workspace.period.statementEndingBalance).toBe(1100);
    });
  });

  describe("closeReconciliationPeriod", () => {
    it("throws 404 when the period is not accessible", async () => {
      prisma.reconciliationPeriod.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.closeReconciliationPeriod({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws 400 when the period is already closed", async () => {
      mockWorkspaceLookups(periodRow({ status: "CLOSED" }), null);

      await expect(
        reconciliationService.closeReconciliationPeriod({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Reconciliation period is already closed",
      });
    });

    it("refuses to close with a non-zero difference", async () => {
      mockWorkspaceLookups(periodRow(), null);
      prisma.reconciliationItem.findMany.mockResolvedValue([]);
      prisma.statementLine.findMany.mockResolvedValue([]);

      await expect(
        reconciliationService.closeReconciliationPeriod({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Difference must be zero before closing.",
      });
    });

    it("refuses to close while unresolved statement lines remain", async () => {
      // opening 1000 + cleared 100 = ending 1100 → difference 0
      mockWorkspaceLookups(periodRow(), null);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e1",
          isCleared: true,
          registerEntry: { amount: 100, categoryId: "cat-1" },
        }),
      ]);
      prisma.statementLine.findMany.mockResolvedValue([
        lineRow({ matchStatus: "statement_only", amount: 7 }),
      ]);

      await expect(
        reconciliationService.closeReconciliationPeriod({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        statusMessage:
          "Unresolved statement lines remain. Add them to the ledger, match them, or ignore them before closing.",
      });
    });

    it("refuses to close while cleared entries lack categories (singular message)", async () => {
      mockWorkspaceLookups(periodRow(), null);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e1",
          isCleared: true,
          registerEntry: { amount: 100, categoryId: null },
        }),
      ]);
      prisma.statementLine.findMany.mockResolvedValue([]);

      await expect(
        reconciliationService.closeReconciliationPeriod({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "1 cleared entry has no category.",
      });
    });

    it("uses a plural message for multiple uncategorized entries", async () => {
      mockWorkspaceLookups(periodRow(), null);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e1",
          isCleared: true,
          registerEntry: { amount: 60, categoryId: null },
        }),
        itemRow({
          id: 9002,
          registerEntryId: "e2",
          isCleared: true,
          registerEntry: { amount: 40, categoryId: null },
        }),
      ]);
      prisma.statementLine.findMany.mockResolvedValue([]);

      await expect(
        reconciliationService.closeReconciliationPeriod({
          userId: 1,
          periodId: 501,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "2 cleared entries have no category.",
      });
    });

    it("reconciles cleared entries and closes the period", async () => {
      // difference = 1100 - (1000 + 100) = 0
      mockWorkspaceLookups(periodRow(), null);
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e1",
          isCleared: true,
          registerEntry: { amount: 100, categoryId: "cat-1" },
        }),
      ]);
      prisma.statementLine.findMany.mockResolvedValue([]);
      const closedRow = periodRow({ status: "CLOSED" });
      prisma.reconciliationPeriod.update.mockResolvedValue(closedRow);

      const result = await reconciliationService.closeReconciliationPeriod({
        userId: 42,
        periodId: 501,
        closeNote: "balanced",
      });

      expect(result).toBe(closedRow);
      expect(prisma.registerEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["e1"] } },
        data: { isCleared: true, isReconciled: true, isPending: true },
      });
      expect(prisma.reconciliationPeriod.update).toHaveBeenCalledWith({
        where: { id: 501 },
        data: {
          status: "CLOSED",
          closedAt: expect.any(Date),
          closedByUserId: 42,
          closeNote: "balanced",
          ledgerClearedBalance: 1100,
          differenceAmount: 0,
        },
        include: { register: { select: { id: true, name: true } } },
      });
    });

    it("defaults the close note to null", async () => {
      mockWorkspaceLookups(periodRow(), null);
      prisma.reconciliationItem.findMany.mockResolvedValue([]);
      prisma.statementLine.findMany.mockResolvedValue([]);
      // difference = 1100 - 1000 = 100 → need cleared sum 100 to hit zero instead
      prisma.reconciliationItem.findMany.mockResolvedValue([
        itemRow({
          registerEntryId: "e1",
          isCleared: true,
          registerEntry: { amount: 100, categoryId: "cat-1" },
        }),
      ]);
      prisma.reconciliationPeriod.update.mockResolvedValue(periodRow());

      await reconciliationService.closeReconciliationPeriod({
        userId: 42,
        periodId: 501,
      });

      expect(prisma.reconciliationPeriod.update.mock.calls[0][0].data.closeNote).toBeNull();
    });
  });

  describe("getOpenReconciliationPeriodSummaries", () => {
    it("throws 403 without budget access", async () => {
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(
        reconciliationService.getOpenReconciliationPeriodSummaries({
          userId: 1,
          budgetId: 7,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("summarizes open periods with their register names", async () => {
      prisma.reconciliationPeriod.findMany.mockResolvedValue([
        periodRow({ id: 501 }),
        periodRow({
          id: 502,
          accountRegisterId: 12,
          register: { id: 12, name: "Savings" },
        }),
      ]);

      const result =
        await reconciliationService.getOpenReconciliationPeriodSummaries({
          userId: 1,
          budgetId: 7,
        });

      expect(result).toEqual([
        {
          id: 501,
          accountRegisterId: 11,
          accountRegisterName: "Checking",
          updatedAt: periodRow().updatedAt,
        },
        {
          id: 502,
          accountRegisterId: 12,
          accountRegisterName: "Savings",
          updatedAt: periodRow().updatedAt,
        },
      ]);
      expect(prisma.reconciliationPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ budgetId: 7, status: "OPEN" }),
        }),
      );
    });
  });
});
