import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { DataPersisterService } from "../DataPersisterService";
import { ModernCacheService } from "../ModernCacheService";
import { createTestDatabase, cleanupTestDatabase } from "./test-utils";
import type { PrismaClient } from "@prisma/client";
import { forecastLogger } from "../logger";
import { dateTimeService } from "../DateTimeService";

describe("DataPersisterService", () => {
  let service: DataPersisterService;
  let mockDb: PrismaClient;
  let mockCache: ModernCacheService;

  beforeEach(async () => {
    mockDb = await createTestDatabase();
    mockCache = new ModernCacheService();

    service = new DataPersisterService(mockDb, mockCache);

    // Mock forecastLogger to avoid test output
    vi.spyOn(forecastLogger, "service").mockImplementation(() => {});
    vi.spyOn(forecastLogger, "serviceDebug").mockImplementation(() => {});
  });

  afterEach(async () => {
    await cleanupTestDatabase(mockDb);
    vi.restoreAllMocks();
  });

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

  describe("persistForecastResults", () => {
    it("should successfully persist results using createMany", async () => {
      const entries = [
        createMockEntry({ id: "entry-1" }),
        createMockEntry({ id: "entry-2" }),
      ];

      // Mock createMany to succeed
      vi.spyOn(mockDb.registerEntry, "createMany").mockResolvedValue({ count: 2 });

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

    it("should preserve original IDs for balance entries", async () => {
      const entries = [
        createMockEntry({ id: "balance-1", isBalanceEntry: true }),
        createMockEntry({ id: "regular-1", isBalanceEntry: false }),
      ];

      // Mock createMany to succeed
      vi.spyOn(mockDb.registerEntry, "createMany").mockResolvedValue({ count: 2 });

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

    it("should fallback to individual creates when createMany fails", async () => {
      const entries = [
        createMockEntry({ id: "entry-1" }),
        createMockEntry({ id: "entry-2" }),
      ];

      // Mock createMany to fail
      vi.spyOn(mockDb.registerEntry, "createMany").mockRejectedValue(
        new Error("Bulk insert failed")
      );

      // Mock individual creates to succeed
      vi.spyOn(mockDb.registerEntry, "create").mockResolvedValue({});

      await service.persistForecastResults(entries);

      expect(mockDb.registerEntry.createMany).toHaveBeenCalled();
      expect(mockDb.registerEntry.create).toHaveBeenCalledTimes(2);
      expect(forecastLogger.service).toHaveBeenCalledWith(
        expect.stringContaining("Using rate-limited fallback for 2 entries")
      );
    });

    it("should handle individual create failures gracefully", async () => {
      const entries = [createMockEntry({ id: "entry-1" })];

      // Mock createMany to fail
      vi.spyOn(mockDb.registerEntry, "createMany").mockRejectedValue(
        new Error("Bulk insert failed")
      );

      // Mock individual create to fail (simulate duplicate key error)
      vi.spyOn(mockDb.registerEntry, "create").mockRejectedValue(new Error("Duplicate key"));

      await service.persistForecastResults(entries);

      expect(mockDb.registerEntry.create).toHaveBeenCalled();
      expect(forecastLogger.service).toHaveBeenCalledWith(
        expect.stringContaining("Skipped duplicate entry")
      );
    });
  });

  describe("cleanupProjectedEntriesByAccount", () => {
    it("should delete projected entries for specific account", async () => {
      const accountId = 123;
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({ count: 5 });

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
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({ count: 0 });

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
        new Error("Database error")
      );

      await expect(
        service.cleanupProjectedEntriesByAccount(accountId)
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
          isCleared: false,
        },
      });

      expect(mockDb.registerEntry.count).toHaveBeenNthCalledWith(2, {
        where: {
          register: { accountId },
          isPending: true,
          isCleared: false,
        },
      });

      expect(mockDb.registerEntry.count).toHaveBeenNthCalledWith(3, {
        where: {
          register: { accountId },
          isManualEntry: true,
          isCleared: false,
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

      const result = await service.getResultsCount(undefined);

      expect(result).toEqual({
        projected: 8,
        pending: 4,
        manual: 2,
        balance: 1,
      });

      // Should pass undefined accountId to all queries
      expect(mockDb.registerEntry.count).toHaveBeenNthCalledWith(1, {
        where: {
          register: { accountId: undefined },
          isProjected: true,
          isCleared: false,
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
        new Error("Database connection failed")
      );

      await expect(service.getResultsCount("test-account")).rejects.toThrow(
        "Database connection failed"
      );
    });
  });

  describe("updateAccountRegisterBalances", () => {
    it("should update account register balances", async () => {
      const accountId = "test-account";
      const mockAccountRegisters = [
        { id: 1, balance: 1000, latestBalance: 800 },
        { id: 2, balance: 500, latestBalance: 300 },
      ];

      vi.spyOn(mockDb.accountRegister, "findMany").mockResolvedValue(mockAccountRegisters);
      vi.spyOn(mockDb.accountRegister, "update").mockResolvedValue({});

      await service.updateAccountRegisterBalances(accountId);

      expect(mockDb.accountRegister.findMany).toHaveBeenCalledWith({
        where: { accountId },
        select: { id: true, balance: true, latestBalance: true },
      });

      expect(mockDb.accountRegister.update).toHaveBeenCalledTimes(2);
      expect(mockDb.accountRegister.update).toHaveBeenNthCalledWith(1, {
        where: { id: 1 },
        data: { latestBalance: 1000 },
      });
      expect(mockDb.accountRegister.update).toHaveBeenNthCalledWith(2, {
        where: { id: 2 },
        data: { latestBalance: 500 },
      });
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
            operations.map((op: any) => op())
          );
          return results;
        }
      );

      // Mock database update to throw error for specific entry
      vi.spyOn(mockDb.registerEntry, "update").mockImplementation(
        async ({ where, data }: any) => {
          if (where.id === "1") {
            throw new Error("Database connection failed");
          }
          return {} as any;
        }
      );

      await service.updateRegisterEntryBalances(mockEntries);

      expect(mockRateLimiter.executeWithLimit).toHaveBeenCalled();
      expect(mockRateLimiter.getStatus).toHaveBeenCalled();
    });

    it("should handle empty entries array", async () => {
      await service.updateRegisterEntryBalances([]);

      expect(mockRateLimiter.executeWithLimit).not.toHaveBeenCalled();
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
      vi.spyOn(mockDb.registerEntry, "findMany").mockResolvedValue([{ id: "1" }] as any[]);

      vi.spyOn(mockDb.registerEntry, "update").mockRejectedValue(
        new Error("Account not found")
      );

      await service.updateRegisterEntryBalances(mockEntries);

      expect(mockRateLimiter.executeWithLimit).toHaveBeenCalled();
    });
  });

  describe("performInitialCleanup - Account-specific cleanup", () => {
    it("should clean up balance entries for specific account", async () => {
      const accountId = "test-account-123";

      vi.spyOn(mockDb.accountRegister, "findMany").mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ] as any[]);

      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({ count: 2 } as any);

      await service.performInitialCleanup(accountId);

      expect(mockDb.accountRegister.findMany).toHaveBeenCalledWith({
        where: { accountId },
        select: { id: true },
      });

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          isBalanceEntry: true,
          accountRegisterId: { in: [1, 2] },
        },
      });
    });

    it("should handle case with no account registers found", async () => {
      const accountId = "test-account-123";

      vi.spyOn(mockDb.accountRegister, "findMany").mockResolvedValue([]);
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({ count: 0 } as any);

      await service.performInitialCleanup(accountId);

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          isBalanceEntry: true,
          accountRegisterId: { in: [] },
        },
      });
    });
  });

  describe("updateEntryStatuses - Complex status updates", () => {
    it("should update projected entries status based on date", async () => {
      const accountId = "test-account-123";

      vi.spyOn(mockDb.registerEntry, "updateMany").mockResolvedValue({ count: 5 } as any);

      await service.updateEntryStatuses(accountId);

      // Should call updateMany 4 times for different status updates
      expect(mockDb.registerEntry.updateMany).toHaveBeenCalledTimes(4);

      // Check that the date filtering is correct
      const calls = mockDb.registerEntry.updateMany.mock.calls;
      expect(calls[0][0].where.isProjected).toBe(true);
      expect(calls[1][0].where.isProjected).toBe(true);
      expect(calls[2][0].where.isManualEntry).toBe(true);
      expect(calls[3][0].where.isManualEntry).toBe(true);
    });

    it("should handle null accountId", async () => {
      vi.spyOn(mockDb.registerEntry, "updateMany").mockResolvedValue({ count: 0 } as any);

      await service.updateEntryStatuses();

      expect(mockDb.registerEntry.updateMany).toHaveBeenCalledTimes(4);
    });
  });

  describe("cleanupProjectedEntries - Account-specific cleanup", () => {
    it("should clean up projected entries for specific account", async () => {
      const accountId = "test-account-123";

      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({ count: 10 } as any);

      await service.cleanupProjectedEntries(accountId);

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          register: { accountId },
          isProjected: true,
          isManualEntry: false,
        },
      });
    });

    it("should handle null accountId", async () => {
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({ count: 5 } as any);

      await service.cleanupProjectedEntries();

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          register: { accountId: undefined },
          isProjected: true,
          isManualEntry: false,
        },
      });
    });
  });

  describe("cleanupProjectedEntriesByAccount - Numeric account ID", () => {
    it("should clean up projected entries by numeric account ID", async () => {
      const accountId = 123;

      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({ count: 3 } as any);

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
      vi.spyOn(mockDb.registerEntry, "deleteMany").mockResolvedValue({ count: 2 } as any);

      await service.cleanupZeroBalanceEntries();

      expect(mockDb.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          description: "Latest Balance",
          isBalanceEntry: false,
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
