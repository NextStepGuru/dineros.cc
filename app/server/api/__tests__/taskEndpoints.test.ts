import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  createError: vi.fn((error: any) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const err = new Error(`HTTP ${statusCode}: ${message}`) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  readBody: vi.fn(),
  getQuery: vi.fn(),
  setResponseStatus: vi.fn(),
  getRouterParam: vi.fn(),
  setHeader: vi.fn(),
  getHeader: vi.fn(),
  getValidatedQuery: vi.fn(),
}));

// Make H3 functions globally available (handlers rely on Nitro auto-imports)
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();
(globalThis as any).getValidatedQuery = vi.fn();

// Mock server dependencies
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/clients/queuesClient", () => ({
  addBackupJob: vi.fn(),
  addRecalculateJob: vi.fn(),
  addPlaidSyncJob: vi.fn(),
  addPlaidBalanceSyncJob: vi.fn(),
  addRecategorizeJob: vi.fn(),
}));

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/services/billCenterService", () => ({
  evaluateBillRemindersForAllBudgets: vi.fn(),
}));

vi.mock("~/server/services/forecast/DateTimeService", () => ({
  dateTimeService: {
    now: vi.fn(() => ({
      startOf: vi.fn(() => ({
        toDate: () => new Date("2024-01-01T00:00:00.000Z"),
      })),
      add: vi.fn(() => ({
        toDate: () => new Date("2026-01-01T00:00:00.000Z"),
      })),
      toDate: () => new Date("2024-01-01T00:00:00.000Z"),
    })),
    nowDate: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
  },
}));

const { mockGenerateKeys, mockMigrate } = vi.hoisted(() => ({
  mockGenerateKeys: vi.fn(),
  mockMigrate: vi.fn(),
}));

vi.mock("~/server/services/RsaService", () => ({
  default: class MockRsaService {
    generateKeys = mockGenerateKeys;
  },
}));

vi.mock("~/prisma/reencrypt", () => ({
  migrate: mockMigrate,
}));

const FIXED_NOW_MS = new Date("2024-01-01T00:00:00.000Z").getTime();

describe("Task API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).getValidatedQuery = vi.fn();
  });

  describe("GET /api/tasks/backup", () => {
    it("enqueues a daily backup job", async () => {
      const module = await import("../tasks/backup");
      const handler = module.default;
      const { addBackupJob } = await import("~/server/clients/queuesClient");

      const result = await handler({});

      expect(addBackupJob).toHaveBeenCalledTimes(1);
      expect(addBackupJob).toHaveBeenCalledWith({ name: "Daily backup" });
      expect(result).toBeUndefined();
    });

    it("propagates queue enqueue errors", async () => {
      const module = await import("../tasks/backup");
      const handler = module.default;
      const { addBackupJob } = await import("~/server/clients/queuesClient");

      (addBackupJob as any).mockImplementation(() => {
        throw new Error("Redis unavailable");
      });

      await expect(handler({})).rejects.toThrow("Redis unavailable");
    });
  });

  describe("GET /api/tasks/bill-reminders", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/bill-reminders");
      handler = module.default;
    });

    it("returns the evaluation summary and logs at info when no failures", async () => {
      const { evaluateBillRemindersForAllBudgets } = await import(
        "~/server/services/billCenterService"
      );
      const { log } = await import("~/server/logger");
      const summary = { sent: 3, skipped: 1, failures: [] };

      (evaluateBillRemindersForAllBudgets as any).mockResolvedValue(summary);

      const result = await handler({});

      expect(result).toBe(summary);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Manual bill reminder evaluation completed",
          level: "info",
          data: summary,
        }),
      );
    });

    it("logs at warn when the summary has failures", async () => {
      const { evaluateBillRemindersForAllBudgets } = await import(
        "~/server/services/billCenterService"
      );
      const { log } = await import("~/server/logger");
      const summary = { sent: 0, skipped: 0, failures: ["boom"] };

      (evaluateBillRemindersForAllBudgets as any).mockResolvedValue(summary);

      const result = await handler({});

      expect(result).toBe(summary);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ level: "warn", data: summary }),
      );
    });

    it("propagates evaluation errors", async () => {
      const { evaluateBillRemindersForAllBudgets } = await import(
        "~/server/services/billCenterService"
      );

      (evaluateBillRemindersForAllBudgets as any).mockRejectedValue(
        new Error("evaluation failed"),
      );

      await expect(handler({})).rejects.toThrow("evaluation failed");
    });
  });

  describe("GET /api/tasks/sync-all", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/sync-all");
      handler = module.default;
    });

    it("enqueues a recalculate job for every active account with recalc entries", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );
      const { log } = await import("~/server/logger");

      (prisma.account.findMany as any).mockResolvedValue([
        { id: "account-1" },
        { id: "account-2" },
      ]);

      const result = await handler({});

      expect(result).toBe(true);
      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: {
          isArchived: false,
          registers: {
            some: {
              isArchived: false,
              entries: {
                some: {
                  hasBalanceReCalc: true,
                },
              },
            },
          },
        },
        select: { id: true },
      });
      expect(addRecalculateJob).toHaveBeenCalledTimes(2);
      expect(addRecalculateJob).toHaveBeenNthCalledWith(1, {
        accountId: "account-1",
      });
      expect(addRecalculateJob).toHaveBeenNthCalledWith(2, {
        accountId: "account-2",
      });
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Recalculating balances for all active accounts",
        }),
      );
    });

    it("enqueues nothing when no accounts need recalculation", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      (prisma.account.findMany as any).mockResolvedValue([]);

      const result = await handler({});

      expect(result).toBe(true);
      expect(addRecalculateJob).not.toHaveBeenCalled();
    });

    it("propagates database errors", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      (prisma.account.findMany as any).mockRejectedValue(
        new Error("db down"),
      );

      await expect(handler({})).rejects.toThrow("db down");
    });
  });

  describe("GET /api/tasks/sync-plaid", () => {
    it("enqueues a forced Plaid sync with a timestamped job id", async () => {
      const module = await import("../tasks/sync-plaid");
      const handler = module.default;
      const { addPlaidSyncJob } = await import("~/server/clients/queuesClient");
      const { log } = await import("~/server/logger");

      const result = await handler({});

      expect(result).toEqual({ message: "Plaid sync job queued." });
      expect(addPlaidSyncJob).toHaveBeenCalledTimes(1);
      expect(addPlaidSyncJob).toHaveBeenCalledWith(
        { name: "Force Plaid sync from admin task" },
        { delay: 0, jobId: `force-plaid-sync-${FIXED_NOW_MS}` },
      );
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Plaid sync job enqueued from admin task",
          level: "info",
        }),
      );
    });

    it("propagates enqueue errors", async () => {
      const module = await import("../tasks/sync-plaid");
      const handler = module.default;
      const { addPlaidSyncJob } = await import("~/server/clients/queuesClient");
      const { log } = await import("~/server/logger");

      (addPlaidSyncJob as any).mockRejectedValue(new Error("queue down"));

      await expect(handler({})).rejects.toThrow("queue down");
      expect(log).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/tasks/sync-plaid-balance", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/sync-plaid-balance");
      handler = module.default;
    });

    it("enqueues a forced balance sync for the requested account register", async () => {
      const { addPlaidBalanceSyncJob } = await import(
        "~/server/clients/queuesClient"
      );
      const event = { node: { req: {} } };

      (globalThis as any).getValidatedQuery.mockImplementation(
        async (_event: unknown, parse: (_arg: unknown) => unknown) =>
          parse({ accountRegisterId: "62" }),
      );

      const result = await handler(event);

      expect(result).toBe(true);
      expect(globalThis.getValidatedQuery).toHaveBeenCalledWith(
        event,
        expect.any(Function),
      );
      expect(addPlaidBalanceSyncJob).toHaveBeenCalledTimes(1);
      expect(addPlaidBalanceSyncJob).toHaveBeenCalledWith({
        accountRegisterId: 62,
        force: true,
      });
    });

    it("rejects when accountRegisterId fails validation", async () => {
      const { addPlaidBalanceSyncJob } = await import(
        "~/server/clients/queuesClient"
      );

      (globalThis as any).getValidatedQuery.mockImplementation(
        async (_event: unknown, parse: (_arg: unknown) => unknown) =>
          parse({ accountRegisterId: "0" }),
      );

      await expect(handler({})).rejects.toThrow();
      expect(addPlaidBalanceSyncJob).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/tasks/migrate", () => {
    it("generates RSA keys then runs the re-encryption migration", async () => {
      const module = await import("../tasks/migrate");
      const handler = module.default;
      const { prisma } = await import("~/server/clients/prismaClient");

      mockGenerateKeys.mockResolvedValue(undefined);
      mockMigrate.mockResolvedValue(undefined);

      const result = await handler({});

      expect(result).toBe(true);
      expect(mockGenerateKeys).toHaveBeenCalledTimes(1);
      expect(mockMigrate).toHaveBeenCalledTimes(1);
      // prisma is a Proxy; compare by identity
      expect(mockMigrate.mock.calls[0][0]).toBe(prisma);
      expect(
        mockGenerateKeys.mock.invocationCallOrder[0],
      ).toBeLessThan(mockMigrate.mock.invocationCallOrder[0]);
    });

    it("propagates migration errors", async () => {
      const module = await import("../tasks/migrate");
      const handler = module.default;

      mockGenerateKeys.mockResolvedValue(undefined);
      mockMigrate.mockRejectedValue(new Error("migration failed"));

      await expect(handler({})).rejects.toThrow("migration failed");
    });
  });

  describe("GET /api/tasks/check-balance-entries", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/check-balance-entries");
      handler = module.default;
    });

    it("returns balance entries grouped by account register", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { log } = await import("~/server/logger");

      const balanceEntries = [
        {
          id: 1,
          accountRegisterId: 62,
          description: "Balance 1",
          createdAt: new Date("2024-01-02T00:00:00.000Z"),
          register: { name: "Checking", account: { name: "E2E Default" } },
        },
        {
          id: 2,
          accountRegisterId: 62,
          description: "Balance 2",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          register: { name: "Checking", account: { name: "E2E Default" } },
        },
        {
          id: 3,
          accountRegisterId: 63,
          description: "Balance 3",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          register: { name: "Savings", account: { name: "E2E Default" } },
        },
      ];
      const accountRegisters = [
        {
          id: 62,
          name: "Checking",
          accountId: "account-1",
          account: { id: "account-1", name: "E2E Default" },
        },
      ];

      (prisma.registerEntry.findMany as any).mockResolvedValue(balanceEntries);
      (prisma.accountRegister.findMany as any).mockResolvedValue(
        accountRegisters,
      );

      const result = await handler({});

      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isBalanceEntry: true } }),
      );
      expect(prisma.accountRegister.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isArchived: false } }),
      );
      expect(result).toEqual({
        totalBalanceEntries: 3,
        totalAccountRegisters: 1,
        balanceEntriesByAccount: {
          62: [balanceEntries[0], balanceEntries[1]],
          63: [balanceEntries[2]],
        },
        allBalanceEntries: balanceEntries,
        accountRegisters,
      });
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Balance entries check",
          level: "info",
        }),
      );
    });

    it("logs the error and rethrows when the queries fail", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { log } = await import("~/server/logger");

      const dbError = new Error("query failed");
      (prisma.registerEntry.findMany as any).mockRejectedValue(dbError);

      await expect(handler({})).rejects.toThrow("query failed");
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Error checking balance entries",
          level: "error",
          data: { error: "query failed" },
        }),
      );
    });
  });

  describe("GET /api/tasks/check-pending-status", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/check-pending-status");
      handler = module.default;
    });

    it("returns pending status counts with a limited sample", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      const entries = [
        {
          id: 1,
          isCleared: false,
          isPending: true,
          isProjected: true,
          isManualEntry: false,
          isBalanceEntry: false,
        },
        {
          id: 2,
          isCleared: false,
          isPending: true,
          isProjected: false,
          isManualEntry: true,
          isBalanceEntry: false,
        },
        {
          id: 3,
          isCleared: false,
          isPending: false,
          isProjected: false,
          isManualEntry: false,
          isBalanceEntry: false,
        },
        {
          id: 4,
          isCleared: false,
          isPending: false,
          isProjected: false,
          isManualEntry: false,
          isBalanceEntry: true,
        },
      ];

      (prisma.registerEntry.findMany as any).mockResolvedValue(entries);

      const result = await handler({});

      expect(prisma.registerEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isCleared: false },
          orderBy: { createdAt: "asc" },
          take: 20,
        }),
      );
      expect(result).toEqual({
        totalEntries: 4,
        pendingEntries: 2,
        nonPendingEntries: 2,
        projectedPending: 1,
        manualPending: 1,
        balanceEntries: 1,
        sampleEntries: entries.slice(0, 10),
      });
    });

    it("logs the error and rethrows when the query fails", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { log } = await import("~/server/logger");

      (prisma.registerEntry.findMany as any).mockRejectedValue(
        new Error("boom"),
      );

      await expect(handler({})).rejects.toThrow("boom");
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Error checking pending status",
          level: "error",
        }),
      );
    });
  });

  describe("GET /api/tasks/check-yearly-reoccurrences", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/check-yearly-reoccurrences");
      handler = module.default;
    });

    it("returns yearly reoccurrences plus counts grouped by interval", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      const yearly = [
        { id: 1, intervalId: 4, description: "Yearly A" },
        { id: 2, intervalId: 4, description: "Yearly B" },
      ];
      const all = [
        { id: 1, intervalId: 4 },
        { id: 2, intervalId: 4 },
        { id: 3, intervalId: 3 },
      ];

      (prisma.reoccurrence.findMany as any)
        .mockResolvedValueOnce(yearly)
        .mockResolvedValueOnce(all);

      const result = await handler({});

      expect(prisma.reoccurrence.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { intervalId: 4 } }),
      );
      expect(prisma.reoccurrence.findMany).toHaveBeenNthCalledWith(
        2,
        expect.not.objectContaining({ where: expect.anything() }),
      );
      expect(result).toEqual({
        yearlyReoccurrences: yearly,
        totalYearly: 2,
        allReoccurrences: {
          4: [all[0], all[1]],
          3: [all[2]],
        },
        intervalCounts: { 4: 2, 3: 1 },
      });
    });

    it("logs the error and rethrows when the query fails", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { log } = await import("~/server/logger");

      (prisma.reoccurrence.findMany as any).mockRejectedValue(
        new Error("kaboom"),
      );

      await expect(handler({})).rejects.toThrow("kaboom");
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Error checking yearly reoccurrences",
          level: "error",
        }),
      );
    });
  });

  describe("GET /api/tasks/cleanup-balance-entries", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../tasks/cleanup-balance-entries");
      handler = module.default;
    });

    it("deletes all balance entries and reports before/after counts", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { log } = await import("~/server/logger");

      (prisma.registerEntry.count as any)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(0);
      (prisma.registerEntry.deleteMany as any).mockResolvedValue({ count: 5 });

      const result = await handler({});

      expect(prisma.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: { isBalanceEntry: true },
      });
      expect(result).toEqual({
        beforeCount: 5,
        afterCount: 0,
        deletedCount: 5,
      });
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Balance entries cleanup completed",
          level: "info",
          data: { beforeCount: 5, afterCount: 0, deletedCount: 5 },
        }),
      );
    });

    it("logs the error and rethrows when the delete fails", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { log } = await import("~/server/logger");

      (prisma.registerEntry.count as any).mockResolvedValue(5);
      (prisma.registerEntry.deleteMany as any).mockRejectedValue(
        new Error("delete failed"),
      );

      await expect(handler({})).rejects.toThrow("delete failed");
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Error cleaning up balance entries",
          level: "error",
        }),
      );
    });
  });
});
