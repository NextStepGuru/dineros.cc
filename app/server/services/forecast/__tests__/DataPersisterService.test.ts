import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { DataPersisterService } from "../DataPersisterService";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient } from "~/types/test-types";
import { forecastLogger } from "../logger";
import { dateTimeService } from "../DateTimeService";

function createMockEntry(overrides: any = {}) {
  return {
    id: "test-entry",
    accountRegisterId: 1,
    sourceAccountRegisterId: null,
    description: "Test Entry",
    amount: 100,
    balance: 1100,
    isBalanceEntry: false,
    isPending: false,
    isProjected: false,
    isManualEntry: false,
    isCleared: false,
    isReconciled: false,
    createdAt: dateTimeService.create("2024-01-01"),
    ...overrides,
  };
}

function captureLastAtFromExecuteRaw(mock: {
  mock: { calls: unknown[][] };
}): Date | undefined {
  const call = mock.mock.calls[0]?.[0] as { values?: unknown[] } | undefined;
  if (!call?.values) return undefined;
  return call.values[1] instanceof Date ? call.values[1] : undefined;
}

describe("DataPersisterService", () => {
  let service: DataPersisterService;
  let mockDb: PrismaClient;

  beforeEach(async () => {
    mockDb = await createTestDatabase();

    service = new DataPersisterService(
      mockDb as unknown as ConstructorParameters<
        typeof DataPersisterService
      >[0],
    );

    // Mock forecastLogger to avoid test output
    vi.spyOn(forecastLogger, "service").mockImplementation(() => {});
    vi.spyOn(forecastLogger, "serviceDebug").mockImplementation(() => {});
  });

  afterEach(async () => {
    await cleanupTestDatabase(mockDb);
    vi.restoreAllMocks();
  });

  describe("persistForecastResults", () => {
    it("should successfully persist results using createMany", async () => {
      const entries = [
        createMockEntry({ id: "entry-1" }),
        createMockEntry({ id: "entry-2" }),
      ];

      // Mock createMany to succeed
      vi.spyOn(mockDb.registerEntry, "createMany").mockResolvedValue({
        count: 2,
      });

      await service.persistForecastResults(entries);

      expect(mockDb.registerEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String), // Should be new CUID for non-balance entries
            createdAt: expect.any(String), // Should be ISO string
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it("should persist createdAt as valid ISO-8601 for Prisma", async () => {
      const entries = [
        createMockEntry({
          id: "entry-iso",
          createdAt: dateTimeService.create("2026-03-15T23:59:59Z"),
        }),
      ];

      vi.spyOn(mockDb.registerEntry, "createMany").mockResolvedValue({
        count: 1,
      });

      await service.persistForecastResults(entries);

      const createManyArgs = vi.mocked(mockDb.registerEntry.createMany).mock
        .calls[0][0];
      const createdAt = createManyArgs.data[0].createdAt;

      expect(typeof createdAt).toBe("string");
      expect(createdAt).not.toContain("[Z]");
      expect(new Date(createdAt).toISOString()).toBe(createdAt);
    });

    it("should preserve original IDs for balance entries", async () => {
      const entries = [
        createMockEntry({ id: "balance-1", isBalanceEntry: true }),
        createMockEntry({ id: "regular-1", isBalanceEntry: false }),
      ];

      // Mock createMany to succeed
      vi.spyOn(mockDb.registerEntry, "createMany").mockResolvedValue({
        count: 2,
      });

      await service.persistForecastResults(entries);

      expect(mockDb.registerEntry.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: "balance-1", // Should preserve original ID for balance entries
            isBalanceEntry: true,
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it("passes null reoccurrenceId in createMany payload (loan payment legs must not send synthetic 0)", async () => {
      const entries = [
        createMockEntry({
          id: "loan-transfer-leg",
          reoccurrenceId: null,
          description: "Transfer for Payment to RV",
          typeId: 6,
          isProjected: true,
        }),
      ];

      vi.spyOn(mockDb.registerEntry, "createMany").mockResolvedValue({
        count: 1,
      });

      await service.persistForecastResults(entries);

      const createManyArgs = vi.mocked(mockDb.registerEntry.createMany).mock
        .calls[0][0];
      expect(createManyArgs.data[0].reoccurrenceId).toBeNull();
    });

    it("should fallback to individual creates when createMany fails", async () => {
      const entries = [
        createMockEntry({ id: "entry-1" }),
        createMockEntry({ id: "entry-2" }),
      ];

      // Mock createMany to fail
      vi.spyOn(mockDb.registerEntry, "createMany").mockRejectedValue(
        new Error("Bulk insert failed"),
      );

      // Mock individual creates to succeed
      vi.spyOn(mockDb.registerEntry, "create").mockResolvedValue({});

      await service.persistForecastResults(entries);

      expect(mockDb.registerEntry.createMany).toHaveBeenCalled();
      expect(mockDb.registerEntry.create).toHaveBeenCalledTimes(2);
      expect(forecastLogger.service).toHaveBeenCalledWith(
        "DataPersisterService",
        expect.stringContaining(
          "Using rate-limited fallback for chunk of 2 entries",
        ),
      );
    });

    it("fallback create keeps null reoccurrenceId on loan transfer-shaped rows", async () => {
      const entries = [
        createMockEntry({
          id: "loan-transfer-source-leg",
          typeId: 6,
          reoccurrenceId: null,
          description: "Transfer for Payment to RV Loan",
          sourceAccountRegisterId: 2,
          isProjected: true,
        }),
      ];

      vi.spyOn(mockDb.registerEntry, "createMany").mockRejectedValue(
        new Error("Bulk insert failed"),
      );
      vi.spyOn(mockDb.registerEntry, "create").mockResolvedValue({});

      await service.persistForecastResults(entries);

      expect(mockDb.registerEntry.create).toHaveBeenCalledTimes(1);
      const createData = vi.mocked(mockDb.registerEntry.create).mock.calls[0][0]
        .data;
      expect(createData.reoccurrenceId).toBeNull();
      expect(createData.typeId).toBe(6);
    });

    it("should handle individual create failures gracefully", async () => {
      const entries = [createMockEntry({ id: "entry-1" })];

      // Mock createMany to fail
      vi.spyOn(mockDb.registerEntry, "createMany").mockRejectedValue(
        new Error("Bulk insert failed"),
      );

      // Mock individual create to fail (simulate duplicate key error)
      vi.spyOn(mockDb.registerEntry, "create").mockRejectedValue(
        new Error("Duplicate key"),
      );

      await service.persistForecastResults(entries);

      expect(mockDb.registerEntry.create).toHaveBeenCalled();
      expect(forecastLogger.service).toHaveBeenCalledWith(
        "DataPersisterService",
        expect.stringContaining("Skipped duplicate entry"),
      );
    });
  });

  describe("cleanupProjectedEntriesByAccount", () => {
    it("should delete projected entries for specific account", async () => {
      const accountId = 123;
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({
        count: 5,
      });

      await service.cleanupProjectedEntriesByAccount(accountId);

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          accountRegisterId: accountId,
          isProjected: true,
          isManualEntry: false,
        },
      });
    });

    it("should handle zero deletions", async () => {
      const accountId = 123;
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({
        count: 0,
      });

      await service.cleanupProjectedEntriesByAccount(accountId);

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          accountRegisterId: accountId,
          isProjected: true,
          isManualEntry: false,
        },
      });
    });

    it("should handle database errors", async () => {
      const accountId = 123;
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockRejectedValue(
        new Error("Database error"),
      );

      await expect(
        service.cleanupProjectedEntriesByAccount(accountId),
      ).rejects.toThrow("Database error");
    });
  });

  describe("getResultsCount", () => {
    it("should return counts for all entry types", async () => {
      const accountId = "test-account";

      // Mock count responses
      vi.spyOn(mockDb.registerEntry, "count")
        .mockResolvedValueOnce(10) // projected
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(3) // manual
        .mockResolvedValueOnce(2); // balance

      const result = await service.getResultsCount(accountId);

      expect(result).toEqual({
        projected: 10,
        pending: 5,
        manual: 3,
        balance: 2,
      });

      expect(mockDb.registerEntry.count).toHaveBeenCalledTimes(4);

      // Verify each query
      expect(mockDb.registerEntry.count).toHaveBeenNthCalledWith(1, {
        where: {
          register: { accountId },
          isProjected: true,
          isPending: false,
          isManualEntry: false,
        },
      });

      expect(mockDb.registerEntry.count).toHaveBeenNthCalledWith(2, {
        where: {
          register: { accountId },
          isPending: true,
        },
      });

      expect(mockDb.registerEntry.count).toHaveBeenNthCalledWith(3, {
        where: {
          register: { accountId },
          isManualEntry: true,
        },
      });

      expect(mockDb.registerEntry.count).toHaveBeenNthCalledWith(4, {
        where: {
          register: { accountId },
          isBalanceEntry: true,
        },
      });
    });

    it("should handle undefined accountId", async () => {
      // Mock count responses
      vi.spyOn(mockDb.registerEntry, "count")
        .mockResolvedValueOnce(8) // projected
        .mockResolvedValueOnce(4) // pending
        .mockResolvedValueOnce(2) // manual
        .mockResolvedValueOnce(1); // balance

      const result = await service.getResultsCount();

      expect(result).toEqual({
        projected: 8,
        pending: 4,
        manual: 2,
        balance: 1,
      });

      // Should pass undefined accountId to all queries
      expect(mockDb.registerEntry.count).toHaveBeenNthCalledWith(1, {
        where: {
          isProjected: true,
          isPending: false,
          isManualEntry: false,
        },
      });
    });

    it("should handle zero counts", async () => {
      // Mock all counts as zero
      vi.spyOn(mockDb.registerEntry, "count").mockResolvedValue(0);

      const result = await service.getResultsCount("empty-account");

      expect(result).toEqual({
        projected: 0,
        pending: 0,
        manual: 0,
        balance: 0,
      });
    });

    it("should handle database errors during count operations", async () => {
      vi.spyOn(mockDb.registerEntry, "count").mockRejectedValue(
        new Error("Database connection failed"),
      );

      await expect(service.getResultsCount("test-account")).rejects.toThrow(
        "Database connection failed",
      );
    });
  });

  // Persistence regression: never future, never regress, latest past from existing or cache lastRunAt (past only).
  describe("persistReoccurrenceLastAt", () => {
    beforeEach(() => {
      (mockDb as any).$executeRaw =
        (mockDb as any).$executeRaw ?? vi.fn().mockResolvedValue(undefined);
    });

    it("should persist lastRunAt when present (past) and use it as final last_at", async () => {
      dateTimeService.setNowOverride(new Date("2026-04-15T12:00:00.000Z"));
      try {
        vi.spyOn(mockDb.reoccurrence, "findMany").mockResolvedValue([
          { id: 1, lastAt: null },
        ]);
        (mockDb as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
        const reoccurrences = [
          {
            id: 1,
            accountId: "a",
            accountRegisterId: 1,
            intervalId: 3,
            intervalName: "Month",
            intervalCount: 1,
            lastAt: new Date("2028-01-02T00:00:00.000Z"),
            lastRunAt: new Date("2026-02-02T00:00:00.000Z"),
            endAt: null,
            amount: 100,
            description: "Monthly",
            updatedAt: new Date(),
            transferAccountRegisterId: null,
            totalIntervals: null,
            elapsedIntervals: null,
            adjustBeforeIfOnWeekend: false,
          } as any,
        ];
        await service.persistReoccurrenceLastAt(reoccurrences);
        expect((mockDb as any).$executeRaw).toHaveBeenCalledTimes(1);
        const lastAt = captureLastAtFromExecuteRaw((mockDb as any).$executeRaw);
        expect(lastAt).toBeDefined();
        expect(lastAt?.toISOString().slice(0, 10)).toBe("2026-02-02");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("should never persist future: cap from existing by stepping forward until next > now", async () => {
      dateTimeService.setNowOverride(new Date("2026-04-01T12:00:00.000Z"));
      try {
        vi.spyOn(mockDb.reoccurrence, "findMany").mockResolvedValue([
          { id: 1, lastAt: new Date("2026-01-02T00:00:00.000Z") },
        ]);
        (mockDb as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
        const reoccurrences = [
          {
            id: 1,
            accountId: "a",
            accountRegisterId: 1,
            intervalId: 3,
            intervalName: "Month",
            intervalCount: 1,
            lastAt: new Date("2028-03-02T00:00:00.000Z"),
            endAt: null,
            amount: 100,
            description: "Monthly",
            updatedAt: new Date(),
            transferAccountRegisterId: null,
            totalIntervals: null,
            elapsedIntervals: null,
            adjustBeforeIfOnWeekend: false,
          } as any,
        ];
        await service.persistReoccurrenceLastAt(reoccurrences);
        const lastAt = captureLastAtFromExecuteRaw((mockDb as any).$executeRaw);
        expect(lastAt).toBeDefined();
        expect(lastAt?.toISOString().slice(0, 10)).toBe("2026-03-02");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("should respect intervalCount when advancing from existing", async () => {
      dateTimeService.setNowOverride(new Date("2026-04-01T12:00:00.000Z"));
      try {
        vi.spyOn(mockDb.reoccurrence, "findMany").mockResolvedValue([
          { id: 1, lastAt: new Date("2026-01-01T00:00:00.000Z") },
        ]);
        (mockDb as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
        const reoccurrences = [
          {
            id: 1,
            accountId: "a",
            accountRegisterId: 1,
            intervalId: 3,
            intervalCount: 2,
            lastRunAt: new Date("2026-01-01T00:00:00.000Z"),
            lastAt: new Date("2026-01-01T00:00:00.000Z"),
            endAt: null,
            amount: 100,
            description: "Every 2 months",
            updatedAt: new Date(),
            transferAccountRegisterId: null,
            totalIntervals: null,
            elapsedIntervals: null,
            adjustBeforeIfOnWeekend: false,
          } as any,
        ];
        await service.persistReoccurrenceLastAt(reoccurrences);
        const lastAt = captureLastAtFromExecuteRaw((mockDb as any).$executeRaw);
        expect(lastAt).toBeDefined();
        expect(lastAt?.toISOString().slice(0, 10)).toBe("2026-03-01");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("should never regress: keep existing last_at when it is later than candidate and proposed", async () => {
      dateTimeService.setNowOverride(new Date("2026-05-01T12:00:00.000Z"));
      try {
        vi.spyOn(mockDb.reoccurrence, "findMany").mockResolvedValue([
          { id: 1, lastAt: new Date("2026-04-15T00:00:00.000Z") },
        ]);
        (mockDb as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
        const reoccurrences = [
          {
            id: 1,
            accountId: "a",
            accountRegisterId: 1,
            intervalId: 3,
            intervalName: "Month",
            intervalCount: 1,
            lastAt: new Date("2026-04-15T00:00:00.000Z"),
            lastRunAt: new Date("2026-03-01T00:00:00.000Z"),
            endAt: null,
            amount: 100,
            description: "Monthly",
            updatedAt: new Date(),
            transferAccountRegisterId: null,
            totalIntervals: null,
            elapsedIntervals: null,
            adjustBeforeIfOnWeekend: false,
          } as any,
        ];
        await service.persistReoccurrenceLastAt(reoccurrences);
        const lastAt = captureLastAtFromExecuteRaw((mockDb as any).$executeRaw);
        expect(lastAt).toBeDefined();
        expect(lastAt?.toISOString().slice(0, 10)).toBe("2026-04-15");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("should ignore future lastRunAt from cache and use latest past from existing", async () => {
      dateTimeService.setNowOverride(new Date("2026-04-10T12:00:00.000Z"));
      try {
        vi.spyOn(mockDb.reoccurrence, "findMany").mockResolvedValue([
          { id: 1, lastAt: new Date("2026-02-01T00:00:00.000Z") },
        ]);
        (mockDb as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
        const reoccurrences = [
          {
            id: 1,
            accountId: "a",
            accountRegisterId: 1,
            intervalId: 3,
            intervalName: "Month",
            intervalCount: 1,
            lastAt: new Date("2028-01-01T00:00:00.000Z"),
            lastRunAt: new Date("2028-01-01T00:00:00.000Z"),
            endAt: null,
            amount: 100,
            description: "Monthly",
            updatedAt: new Date(),
            transferAccountRegisterId: null,
            totalIntervals: null,
            elapsedIntervals: null,
            adjustBeforeIfOnWeekend: false,
          } as any,
        ];
        await service.persistReoccurrenceLastAt(reoccurrences);
        const lastAt = captureLastAtFromExecuteRaw((mockDb as any).$executeRaw);
        expect(lastAt).toBeDefined();
        expect(lastAt?.toISOString().slice(0, 10)).toBe("2026-04-01");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("advances twice-monthly recurrences from existing lastAt up to latest past run", async () => {
      dateTimeService.setNowOverride(new Date("2024-03-20T12:00:00.000Z"));
      try {
        vi.spyOn(mockDb.reoccurrence, "findMany").mockResolvedValue([
          { id: 1, lastAt: new Date("2024-01-31T00:00:00.000Z") },
        ]);
        (mockDb as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
        const reoccurrences = [
          {
            id: 1,
            accountId: "a",
            accountRegisterId: 1,
            intervalId: 6,
            intervalName: "15th & Last Day",
            intervalCount: 1,
            lastAt: new Date("2024-01-31T00:00:00.000Z"),
            endAt: null,
            amount: 100,
            description: "Semi-Monthly",
            updatedAt: new Date(),
            transferAccountRegisterId: null,
            totalIntervals: null,
            elapsedIntervals: null,
            adjustBeforeIfOnWeekend: false,
          } as any,
        ];
        await service.persistReoccurrenceLastAt(reoccurrences);
        const lastAt = captureLastAtFromExecuteRaw((mockDb as any).$executeRaw);
        expect(lastAt).toBeDefined();
        expect(lastAt?.toISOString().slice(0, 10)).toBe("2024-03-15");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });

    it("falls back to intervalId when intervalName is unsupported", async () => {
      dateTimeService.setNowOverride(new Date("2026-04-01T12:00:00.000Z"));
      try {
        vi.spyOn(mockDb.reoccurrence, "findMany").mockResolvedValue([
          { id: 1, lastAt: new Date("2026-01-02T00:00:00.000Z") },
        ]);
        (mockDb as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
        const reoccurrences = [
          {
            id: 1,
            accountId: "a",
            accountRegisterId: 1,
            intervalId: 3,
            intervalName: "fortnightly",
            intervalCount: 1,
            lastAt: new Date("2026-01-02T00:00:00.000Z"),
            endAt: null,
            amount: 100,
            description: "Fallback monthly",
            updatedAt: new Date(),
            transferAccountRegisterId: null,
            totalIntervals: null,
            elapsedIntervals: null,
            adjustBeforeIfOnWeekend: false,
          } as any,
        ];
        await service.persistReoccurrenceLastAt(reoccurrences);
        const lastAt = captureLastAtFromExecuteRaw((mockDb as any).$executeRaw);
        expect(lastAt).toBeDefined();
        expect(lastAt?.toISOString().slice(0, 10)).toBe("2026-03-02");
      } finally {
        dateTimeService.clearNowOverride();
      }
    });
  });

  describe("updateAccountRegisterBalances", () => {
    it("should bulk update account register latest_balance from cache", async () => {
      const mockAccountRegisters = [
        { id: 1, balance: 1000, latestBalance: 800 } as any,
        { id: 2, balance: 500, latestBalance: 300 } as any,
      ];

      mockDb.$executeRaw = vi.fn().mockResolvedValue(undefined);

      await service.updateAccountRegisterBalances(mockAccountRegisters);

      expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("should no-op when accountRegisters is empty", async () => {
      mockDb.$executeRaw = vi.fn();

      await service.updateAccountRegisterBalances([]);

      expect(mockDb.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("autoApplyPastPocketEntries", () => {
    afterEach(() => {
      dateTimeService.clearNowOverride();
    });

    it("is a no-op when pocketRegisterIds is empty", async () => {
      const groupBy = vi.spyOn(mockDb.registerEntry, "groupBy");
      await service.autoApplyPastPocketEntries([]);
      expect(groupBy).not.toHaveBeenCalled();
    });

    it("applies past uncleared pocket entries and increments register balances", async () => {
      dateTimeService.setNowOverride(new Date("2024-06-15T12:00:00.000Z"));

      await mockDb.accountRegister.create({
        data: {
          accountId: "acct-pocket-test",
          budgetId: 1,
          name: "Master",
          typeId: 1,
          balance: 1000,
          latestBalance: 1000,
          statementIntervalId: 1,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
        },
      });
      const masterId = 1;
      await mockDb.accountRegister.create({
        data: {
          accountId: "acct-pocket-test",
          budgetId: 1,
          name: "Pocket",
          typeId: 1,
          balance: 0,
          latestBalance: 0,
          statementIntervalId: 1,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          subAccountRegisterId: masterId,
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
        },
      });
      const pocketId = 2;

      await mockDb.registerEntry.create({
        data: {
          accountRegisterId: pocketId,
          amount: 25,
          balance: 0,
          description: "Past pocket",
          createdAt: new Date("2024-06-01T00:00:00.000Z"),
          isCleared: false,
          isProjected: true,
          isPending: true,
          isBalanceEntry: false,
          isManualEntry: false,
          isReconciled: false,
          sourceAccountRegisterId: null,
        },
      });

      await service.autoApplyPastPocketEntries([pocketId]);

      const entries = await mockDb.registerEntry.findMany({});
      const applied = entries.find(
        (e: { description: string }) => e.description === "Past pocket",
      );
      expect(applied?.isCleared).toBe(true);
      expect(applied?.isPending).toBe(false);
      expect(applied?.isProjected).toBe(false);

      const pocketReg = (await mockDb.accountRegister.findMany({})).find(
        (r: { id: number }) => r.id === pocketId,
      );
      expect(Number(pocketReg?.balance)).toBe(25);
      expect(Number(pocketReg?.latestBalance)).toBe(25);
    });

    it("does not apply future pocket entries", async () => {
      dateTimeService.setNowOverride(new Date("2024-06-15T12:00:00.000Z"));

      await mockDb.accountRegister.create({
        data: {
          accountId: "acct-pocket-future",
          budgetId: 1,
          name: "Master",
          typeId: 1,
          balance: 1000,
          latestBalance: 1000,
          statementIntervalId: 1,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
        },
      });
      await mockDb.accountRegister.create({
        data: {
          accountId: "acct-pocket-future",
          budgetId: 1,
          name: "Pocket",
          typeId: 1,
          balance: 0,
          latestBalance: 0,
          statementIntervalId: 1,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          subAccountRegisterId: 1,
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
        },
      });
      const pocketId = 2;

      await mockDb.registerEntry.create({
        data: {
          accountRegisterId: pocketId,
          amount: 40,
          balance: 0,
          description: "Future pocket",
          createdAt: new Date("2024-07-01T00:00:00.000Z"),
          isCleared: false,
          isProjected: true,
          isPending: false,
          isBalanceEntry: false,
          isManualEntry: false,
          isReconciled: false,
        },
      });

      await service.autoApplyPastPocketEntries([pocketId]);

      const entries = await mockDb.registerEntry.findMany({});
      const row = entries.find(
        (e: { description: string }) => e.description === "Future pocket",
      );
      expect(row?.isCleared).toBe(false);
      const pocketReg = (await mockDb.accountRegister.findMany({})).find(
        (r: { id: number }) => r.id === pocketId,
      );
      expect(Number(pocketReg?.balance)).toBe(0);
    });

    it("skips balance rows", async () => {
      dateTimeService.setNowOverride(new Date("2024-06-15T12:00:00.000Z"));

      await mockDb.accountRegister.create({
        data: {
          accountId: "acct-bal-skip",
          budgetId: 1,
          name: "Master",
          typeId: 1,
          balance: 100,
          latestBalance: 100,
          statementIntervalId: 1,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
        },
      });
      await mockDb.accountRegister.create({
        data: {
          accountId: "acct-bal-skip",
          budgetId: 1,
          name: "Pocket",
          typeId: 1,
          balance: 0,
          latestBalance: 0,
          statementIntervalId: 1,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          subAccountRegisterId: 1,
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
        },
      });
      const pocketId = 2;

      await mockDb.registerEntry.create({
        data: {
          accountRegisterId: pocketId,
          amount: 0,
          balance: 0,
          description: "Opening",
          createdAt: new Date("2024-05-01T00:00:00.000Z"),
          isCleared: false,
          isProjected: false,
          isPending: false,
          isBalanceEntry: true,
          isManualEntry: false,
          isReconciled: false,
        },
      });

      await service.autoApplyPastPocketEntries([pocketId]);

      const entries = await mockDb.registerEntry.findMany({});
      const row = entries.find(
        (e: { description: string }) => e.description === "Opening",
      );
      expect(row?.isBalanceEntry).toBe(true);
      expect(row?.isCleared).toBe(false);
    });

    it("applies transfer partner entries on non-pocket registers", async () => {
      dateTimeService.setNowOverride(new Date("2024-06-15T12:00:00.000Z"));

      await mockDb.accountRegister.create({
        data: {
          accountId: "acct-tx",
          budgetId: 1,
          name: "Checking",
          typeId: 1,
          balance: 500,
          latestBalance: 500,
          statementIntervalId: 1,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
        },
      });
      const checkingId = 1;
      await mockDb.accountRegister.create({
        data: {
          accountId: "acct-tx",
          budgetId: 1,
          name: "Pocket",
          typeId: 1,
          balance: 0,
          latestBalance: 0,
          statementIntervalId: 1,
          statementAt: new Date("2024-01-01T00:00:00.000Z"),
          subAccountRegisterId: checkingId,
          loanPaymentSortOrder: 0,
          savingsGoalSortOrder: 0,
        },
      });
      const pocketId = 2;

      await mockDb.registerEntry.create({
        data: {
          accountRegisterId: checkingId,
          amount: 100,
          balance: 0,
          description: "Transfer in",
          createdAt: new Date("2024-06-01T00:00:00.000Z"),
          isCleared: false,
          isProjected: true,
          isPending: true,
          isBalanceEntry: false,
          isManualEntry: false,
          isReconciled: false,
          sourceAccountRegisterId: pocketId,
        },
      });

      await service.autoApplyPastPocketEntries([pocketId]);

      const entries = await mockDb.registerEntry.findMany({});
      const transferIn = entries.find(
        (e: { description: string }) => e.description === "Transfer in",
      );
      expect(transferIn?.isCleared).toBe(true);

      const checking = (await mockDb.accountRegister.findMany({})).find(
        (r: { id: number }) => r.id === checkingId,
      );
      expect(Number(checking?.balance)).toBe(600);
      expect(Number(checking?.latestBalance)).toBe(600);
    });
  });
});

describe("DataPersisterService - Error Handling and Edge Cases", () => {
  let service: DataPersisterService;
  let mockDb: any;
  let mockRateLimiter: any;

  beforeEach(() => {
    mockDb = {
      registerEntry: {
        update: vi.fn(),
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
      },
      accountRegister: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      reoccurrence: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $executeRaw: vi.fn().mockResolvedValue(undefined),
    } as any;

    mockRateLimiter = {
      executeWithLimit: vi.fn(),
      getStatus: vi
        .fn()
        .mockReturnValue({ completed: 0, failed: 0, pending: 0 }),
    } as any;

    service = new DataPersisterService(mockDb);
    // Mock the rate limiter property
    (service as any).rateLimiter = mockRateLimiter;
  });

  describe("updateRegisterEntryBalances - Error Handling", () => {
    it("should handle database update errors gracefully", async () => {
      const mockEntries: any[] = [
        {
          id: "1",
          accountRegisterId: 1,
          balance: 100,
          amount: 50,
          description: "Test Entry",
          createdAt: dateTimeService.create("2024-01-01"),
          isBalanceEntry: false,
          isPending: false,
          isCleared: false,
          isProjected: false,
          isManualEntry: true, // This should trigger the update
          isReconciled: false,
          reoccurrenceId: null,
          sourceAccountRegisterId: null,
          seq: null,
        },
        {
          id: "2",
          accountRegisterId: 1,
          balance: 200,
          amount: 100,
          description: "Test Entry 2",
          createdAt: dateTimeService.create("2024-01-01"),
          isBalanceEntry: false,
          isPending: false,
          isCleared: false,
          isProjected: false,
          isManualEntry: true, // This should trigger the update
          isReconciled: false,
          reoccurrenceId: null,
          sourceAccountRegisterId: null,
          seq: null,
        },
      ];

      // Mock findMany to return existing entries
      vi.spyOn(mockDb.registerEntry, "findMany").mockResolvedValue([
        { id: "1" },
        { id: "2" },
      ] as any[]);

      // Mock rate limiter to simulate some operations failing
      mockRateLimiter.executeWithLimit.mockImplementation(
        async (operations: any[]) => {
          const results = await Promise.allSettled(
            operations.map((op: any) => op()),
          );
          return results;
        },
      );

      // Mock database update to throw error for specific entry
      vi.spyOn(mockDb.registerEntry, "update").mockImplementation(
        async ({ where, data: _data }: any) => {
          if (where.id === "1") {
            throw new Error("Database connection failed");
          }
          return {} as any;
        },
      );

      await service.updateRegisterEntryBalances(mockEntries);

      expect(mockDb.$executeRaw).toHaveBeenCalled();
    });

    it("should handle empty entries array", async () => {
      await service.updateRegisterEntryBalances([]);

      expect(mockDb.$executeRaw).not.toHaveBeenCalled();
    });

    it("should handle entries with invalid accountRegisterId", async () => {
      const mockEntries: any[] = [
        {
          id: "1",
          accountRegisterId: 999, // Non-existent account
          balance: 100,
          amount: 50,
          description: "Test Entry",
          createdAt: dateTimeService.create("2024-01-01"),
          isBalanceEntry: false,
          isPending: false,
          isCleared: false,
          isProjected: false,
          isManualEntry: true, // This should trigger the update
          isReconciled: false,
          reoccurrenceId: null,
          sourceAccountRegisterId: null,
          seq: null,
        },
      ];

      // Mock findMany to return existing entries
      vi.spyOn(mockDb.registerEntry, "findMany").mockResolvedValue([
        { id: "1" },
      ] as any[]);

      vi.spyOn(mockDb.registerEntry, "update").mockRejectedValue(
        new Error("Account not found"),
      );

      await service.updateRegisterEntryBalances(mockEntries);

      expect(mockDb.$executeRaw).toHaveBeenCalled();
    });
  });

  describe("performInitialCleanup - Account-specific cleanup", () => {
    it("should clean up balance entries for specific account", async () => {
      const accountId = "test-account-123";

      vi.spyOn(mockDb.accountRegister, "findMany").mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ] as any[]);

      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({
        count: 2,
      } as any);

      await service.performInitialCleanup(accountId);

      expect(mockDb.accountRegister.findMany).toHaveBeenCalledWith({
        where: { accountId },
        select: { id: true },
      });

      // First call: cleanupProjectedEntries; second: balance entries
      expect(mockDb.registerEntry.deleteMany).toHaveBeenNthCalledWith(2, {
        where: {
          isBalanceEntry: true,
          accountRegisterId: { in: [1, 2] },
        },
      });
    });

    it("should handle case with no account registers found", async () => {
      const accountId = "test-account-123";

      vi.spyOn(mockDb.accountRegister, "findMany").mockResolvedValue([]);
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({
        count: 0,
      } as any);

      await service.performInitialCleanup(accountId);

      // When no registers found, ids.length is 0 so we never call deleteMany for "Latest Balance".
      // We do call deleteMany from cleanupProjectedEntries (and convertOldProjectedToPending).
      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          register: { accountId },
          isProjected: true,
          isPending: false,
          isManualEntry: false,
        },
      });
    });
  });

  describe("updateEntryStatuses - Complex status updates", () => {
    it("should update projected entries status based on date", async () => {
      const accountId = "test-account-123";

      await service.updateEntryStatuses(accountId);

      expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it("should handle null accountId", async () => {
      vi.spyOn(mockDb.accountRegister, "findMany").mockResolvedValue([
        { accountId: "acc-1" },
      ]);

      await service.updateEntryStatuses();

      expect(mockDb.accountRegister.findMany).toHaveBeenCalledWith({
        select: { accountId: true },
        distinct: ["accountId"],
      });
      expect(mockDb.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("cleanupProjectedEntries - Account-specific cleanup", () => {
    it("should clean up projected entries for specific account", async () => {
      const accountId = "test-account-123";

      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({
        count: 10,
      } as any);

      await service.cleanupProjectedEntries(accountId);

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          register: { accountId },
          isProjected: true,
          isPending: false,
          isManualEntry: false,
        },
      });
    });

    it("should handle null accountId", async () => {
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({
        count: 5,
      } as any);

      await service.cleanupProjectedEntries();

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          isProjected: true,
          isPending: false,
          isManualEntry: false,
        },
      });
    });
  });

  describe("cleanupProjectedEntriesByAccount - Numeric account ID", () => {
    it("should clean up projected entries by numeric account ID", async () => {
      const accountId = 123;

      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({
        count: 3,
      } as any);

      await service.cleanupProjectedEntriesByAccount(accountId);

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          accountRegisterId: accountId,
          isProjected: true,
          isManualEntry: false,
        },
      });
    });
  });

  describe("cleanupZeroBalanceEntries", () => {
    it("should clean up zero balance entries", async () => {
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({
        count: 2,
      } as any);

      await (service as any).cleanupZeroBalanceEntries();

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          isBalanceEntry: true,
          amount: 0,
          isProjected: false,
        },
      });
    });
  });

  describe("getResultsCount", () => {
    it("should return correct counts for account", async () => {
      const accountId = "test-account-123";

      vi.spyOn(mockDb.registerEntry, "count")
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);

      const result = await service.getResultsCount(accountId);

      expect(result).toEqual({
        projected: 5,
        pending: 3,
        manual: 2,
        balance: 1,
      });

      expect(mockDb.registerEntry.count).toHaveBeenCalledTimes(4);
    });

    it("should handle null accountId", async () => {
      vi.spyOn(mockDb.registerEntry, "count")
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getResultsCount();

      expect(result).toEqual({
        projected: 0,
        pending: 0,
        manual: 0,
        balance: 0,
      });
    });
  });
});
