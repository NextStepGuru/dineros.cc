import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  // Some admin handlers rely on Nuxt's bare auto-import of defineEventHandler
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

// Mock H3/Nuxt utilities before any imports
vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || "Unknown error";
    const fullMessage = `HTTP ${statusCode}: ${message}`;
    const err = new Error(fullMessage) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  readBody: vi.fn(),
  getQuery: vi.fn(),
  getRouterParam: vi.fn(),
  setHeader: vi.fn(),
  setResponseStatus: vi.fn(),
  isError: vi.fn((error: unknown) => error instanceof Error),
}));

// Make H3/Nuxt functions globally available
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();
(globalThis as any).getRouterParam = vi.fn();
(globalThis as any).setHeader = vi.fn();
(globalThis as any).setResponseStatus = vi.fn();

const envState = vi.hoisted(() => ({
  POSTMARK_SERVER_TOKEN: "test-postmark-token" as string | undefined,
}));

vi.mock("~/server/env", () => ({ default: envState }));

const runtimeConfigState = vi.hoisted(() => ({
  value: { public: {} } as Record<string, unknown>,
}));

const redisMock = vi.hoisted(() => ({
  ping: vi.fn().mockResolvedValue("PONG"),
}));

const fetchMock = vi.hoisted(() => vi.fn());

// Mock server dependencies
vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/clients/redisClient", () => ({
  sharedRedisConnection: redisMock,
}));

vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
  addPlaidSyncJob: vi.fn(),
}));

vi.mock("~/server/lib/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn().mockReturnValue({ userId: 123 }),
}));

const forbiddenError = () =>
  Object.assign(new Error("HTTP 403: Forbidden"), {
    statusCode: 403,
    statusMessage: "Forbidden",
  });

describe("Admin API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
    (globalThis as any).getRouterParam = vi.fn();
    (globalThis as any).setHeader = vi.fn();
    (globalThis as any).setResponseStatus = vi.fn();
    (globalThis as any).useRuntimeConfig = vi.fn(() => runtimeConfigState.value);
    envState.POSTMARK_SERVER_TOKEN = "test-postmark-token";
    runtimeConfigState.value = { public: {} };
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("GET /api/admin/accounts", () => {
    const importHandler = async () =>
      (await import("../admin/accounts.get")).default;

    it("returns paginated accounts with member counts for a search", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const updatedAt = new Date("2024-01-01T00:00:00.000Z");

      (getQuery as any).mockReturnValue({
        q: "checking",
        limit: "10",
        offset: "0",
      });
      (prisma.account.findMany as any).mockResolvedValue([
        {
          id: "acc-1",
          name: "Checking",
          isArchived: false,
          updatedAt,
          _count: { userAccounts: 2 },
        },
      ]);
      (prisma.account.count as any).mockResolvedValue(1);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({
        items: [
          {
            id: "acc-1",
            name: "Checking",
            isArchived: false,
            updatedAt,
            memberCount: 2,
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      });
      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { id: { contains: "checking" } },
              { name: { contains: "checking" } },
              {
                userAccounts: {
                  some: { user: { email: { contains: "checking" } } },
                },
              },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
          skip: 0,
        }),
      );
      expect(prisma.account.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { id: { contains: "checking" } },
            { name: { contains: "checking" } },
            {
              userAccounts: {
                some: { user: { email: { contains: "checking" } } },
              },
            },
          ],
        },
      });
    });

    it("uses no where clause when the search is empty", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getQuery as any).mockReturnValue({ limit: "25", offset: "0" });
      (prisma.account.findMany as any).mockResolvedValue([]);
      (prisma.account.count as any).mockResolvedValue(0);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toMatchObject({ total: 0, limit: 25, offset: 0 });
      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined, take: 25, skip: 0 }),
      );
    });

    it("rejects non-admins with 403", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      const { handleApiError } = await import("~/server/lib/handleApiError");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });

      expect(prisma.account.findMany).not.toHaveBeenCalled();
      expect(handleApiError).toHaveBeenCalledWith(expect.anything());
    });
  });

  describe("GET /api/admin/accounts/:id", () => {
    const importHandler = async () =>
      (await import("../admin/accounts/[id].get")).default;

    it("returns account detail with members and plaid cursor state", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const updatedAt = new Date("2024-01-01T00:00:00.000Z");
      const cursorAt = new Date("2024-01-02T00:00:00.000Z");

      (prisma.account.findUnique as any).mockResolvedValue({
        id: "acc-1",
        name: "Checking",
        isArchived: false,
        isDefault: true,
        lastAccessedAt: null,
        updatedAt,
        userAccounts: [
          {
            id: 11,
            userId: 1,
            updatedAt,
            user: {
              id: 1,
              firstName: "Ada",
              lastName: "One",
              email: "ada@example.com",
              role: "USER",
              isArchived: false,
            },
          },
          {
            id: 12,
            userId: 2,
            updatedAt,
            user: {
              id: 2,
              firstName: "Root",
              lastName: "Admin",
              email: "admin@dineros.cc",
              role: null,
              isArchived: false,
            },
          },
        ],
      });
      (prisma.plaidItem.findMany as any).mockResolvedValue([
        { itemId: "item-1", userId: 1, updatedAt },
      ]);
      (prisma.plaidSyncCursor.findMany as any).mockResolvedValue([
        { itemId: "item-1", updatedAt: cursorAt },
      ]);

      const handler = await importHandler();
      const result = await handler({ context: { params: { id: "acc-1" } } });

      expect(prisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        select: expect.any(Object),
      });
      expect(prisma.plaidItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: { in: [1, 2] } } }),
      );
      expect(prisma.plaidSyncCursor.findMany).toHaveBeenCalledWith({
        where: { itemId: { in: ["item-1"] } },
        select: { itemId: true, updatedAt: true },
      });
      expect(result).toEqual({
        id: "acc-1",
        name: "Checking",
        isArchived: false,
        isDefault: true,
        lastAccessedAt: null,
        updatedAt,
        plaidItems: [
          { itemId: "item-1", userId: 1, updatedAt, syncCursorUpdatedAt: cursorAt },
        ],
        members: [
          {
            membershipId: 11,
            userId: 1,
            updatedAt,
            user: {
              id: 1,
              firstName: "Ada",
              lastName: "One",
              email: "ada@example.com",
              role: "USER",
              isArchived: false,
            },
          },
          {
            membershipId: 12,
            userId: 2,
            updatedAt,
            user: {
              id: 2,
              firstName: "Root",
              lastName: "Admin",
              email: "admin@dineros.cc",
              role: "ADMIN",
              isArchived: false,
            },
          },
        ],
      });
    });

    it("skips plaid lookups when the account has no members", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      (prisma.account.findUnique as any).mockResolvedValue({
        id: "acc-1",
        name: "Checking",
        isArchived: false,
        isDefault: false,
        lastAccessedAt: null,
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        userAccounts: [],
      });

      const handler = await importHandler();
      const result = await handler({ context: { params: { id: "acc-1" } } });

      expect(result.plaidItems).toEqual([]);
      expect(prisma.plaidItem.findMany).not.toHaveBeenCalled();
      expect(prisma.plaidSyncCursor.findMany).not.toHaveBeenCalled();
    });

    it("404 when the account does not exist", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const handler = await importHandler();
      await expect(
        handler({ context: { params: { id: "missing" } } }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("400 when the id param is missing", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      const handler = await importHandler();
      await expect(handler({ context: { params: {} } })).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(
        handler({ context: { params: { id: "acc-1" } } }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("POST /api/admin/accounts/:id/cleanup-balance-entries", () => {
    const importHandler = async () =>
      (await import("../admin/accounts/[id]/cleanup-balance-entries.post"))
        .default;

    it("deletes balance entries and records an audit row", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("acc-1");
      (prisma.account.findUnique as any).mockResolvedValue({ id: "acc-1" });
      (prisma.registerEntry.deleteMany as any).mockResolvedValue({ count: 7 });

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({
        message: "Balance entries removed for this account.",
        deletedCount: 7,
        accountId: "acc-1",
      });
      expect(prisma.registerEntry.deleteMany).toHaveBeenCalledWith({
        where: { isBalanceEntry: true, register: { accountId: "acc-1" } },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminUserId: 123,
          action: "account.balance_entries_cleanup",
          targetUserId: null,
          targetAccountId: "acc-1",
          metadata: { deletedCount: 7 },
        },
      });
    });

    it("404 when the account does not exist", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("missing");
      (prisma.account.findUnique as any).mockResolvedValue(null);

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
      expect(prisma.registerEntry.deleteMany).not.toHaveBeenCalled();
    });

    it("400 when the id param is missing", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue(undefined);

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("POST /api/admin/accounts/:id/recalculate", () => {
    const importHandler = async () =>
      (await import("../admin/accounts/[id]/recalculate.post")).default;

    it("queues a recalculate job and records an audit row", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      (getRouterParam as any).mockReturnValue("acc-1");
      (prisma.accountRegister.findFirst as any).mockResolvedValue({ id: 1 });

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({
        message: "Recalculate job queued.",
        accountId: "acc-1",
      });
      expect(prisma.accountRegister.findFirst).toHaveBeenCalledWith({
        where: { accountId: "acc-1", isArchived: false },
        select: { id: true },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "acc-1" });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminUserId: 123,
          action: "account.recalculate_queued",
          targetUserId: null,
          targetAccountId: "acc-1",
          metadata: undefined,
        },
      });
    });

    it("404 when the account has no active registers", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addRecalculateJob } = await import(
        "~/server/clients/queuesClient"
      );

      (getRouterParam as any).mockReturnValue("acc-1");
      (prisma.accountRegister.findFirst as any).mockResolvedValue(null);

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
      expect(addRecalculateJob).not.toHaveBeenCalled();
    });

    it("400 when the id param is missing", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue(undefined);

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("POST /api/admin/accounts/:id/sync-plaid", () => {
    const importHandler = async () =>
      (await import("../admin/accounts/[id]/sync-plaid.post")).default;

    it("queues a plaid sync job per member item and records an audit row", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addPlaidSyncJob } = await import("~/server/clients/queuesClient");

      (getRouterParam as any).mockReturnValue("acc-1");
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
        { userId: 1 }, // duplicate must be de-duplicated
      ]);
      (prisma.plaidItem.findMany as any).mockResolvedValue([
        { itemId: "item-9" },
        { itemId: "item-10" },
      ]);

      const handler = await importHandler();
      const result = await handler({});

      expect(prisma.userAccount.findMany).toHaveBeenCalledWith({
        where: { accountId: "acc-1" },
        select: { userId: true },
      });
      expect(prisma.plaidItem.findMany).toHaveBeenCalledWith({
        where: { userId: { in: [1, 2] } },
        select: { itemId: true },
      });
      expect(addPlaidSyncJob).toHaveBeenCalledTimes(2);
      expect(addPlaidSyncJob).toHaveBeenCalledWith(
        { name: "admin-account-acc-1-plaid", itemId: "item-9" },
        {
          delay: 0,
          jobId: expect.stringMatching(/^admin-plaid-acc-1-item-9-\d+-0$/),
        },
      );
      expect(addPlaidSyncJob).toHaveBeenCalledWith(
        { name: "admin-account-acc-1-plaid", itemId: "item-10" },
        {
          delay: 0,
          jobId: expect.stringMatching(/^admin-plaid-acc-1-item-10-\d+-1$/),
        },
      );
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminUserId: 123,
          action: "account.plaid_sync_queued",
          targetUserId: null,
          targetAccountId: "acc-1",
          metadata: { itemCount: 2 },
        },
      });
      expect(result).toEqual({
        message: "Queued Plaid sync for 2 item(s).",
        queued: 2,
        accountId: "acc-1",
      });
    });

    it("returns queued 0 when members have no plaid items", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { addPlaidSyncJob } = await import("~/server/clients/queuesClient");

      (getRouterParam as any).mockReturnValue("acc-1");
      (prisma.userAccount.findMany as any).mockResolvedValue([
        { userId: 1 },
      ]);
      (prisma.plaidItem.findMany as any).mockResolvedValue([]);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toMatchObject({ queued: 0, accountId: "acc-1" });
      expect(addPlaidSyncJob).not.toHaveBeenCalled();
    });

    it("404 when the account has no members", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("acc-1");
      (prisma.userAccount.findMany as any).mockResolvedValue([]);

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
    });

    it("400 when the id param is missing", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue(undefined);

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("GET /api/admin/audit-logs", () => {
    const importHandler = async () =>
      (await import("../admin/audit-logs.get")).default;

    it("returns filtered, paginated audit logs", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const createdAt = new Date("2024-01-02T03:04:05.000Z");

      (getQuery as any).mockReturnValue({
        limit: "5",
        offset: "10",
        action: "user.update",
        adminUserId: "123",
        targetUserId: "456",
      });
      (prisma.adminAuditLog.findMany as any).mockResolvedValue([
        {
          id: 1,
          adminUserId: 123,
          action: "user.update",
          targetUserId: 456,
          targetAccountId: "acc-1",
          metadata: { deletedCount: 7 },
          createdAt,
        },
      ]);
      (prisma.adminAuditLog.count as any).mockResolvedValue(1);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({
        items: [
          {
            id: 1,
            adminUserId: 123,
            action: "user.update",
            targetUserId: 456,
            targetAccountId: "acc-1",
            metadata: { deletedCount: 7 },
            createdAt,
          },
        ],
        total: 1,
        limit: 5,
        offset: 10,
      });
      expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            action: { contains: "user.update" },
            adminUserId: 123,
            targetUserId: 456,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          skip: 10,
        }),
      );
    });

    it("returns CSV with download headers when format=csv", async () => {
      const { getQuery, setHeader } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getQuery as any).mockReturnValue({ format: "csv" });
      (prisma.adminAuditLog.findMany as any).mockResolvedValue([
        {
          id: 1,
          adminUserId: 123,
          action: "user.update",
          targetUserId: 456,
          targetAccountId: "acc-1",
          metadata: { k: 1 },
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      ]);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toBe(
        [
          "id,createdAt,adminUserId,action,targetUserId,targetAccountId,metadataJson",
          '1,2024-01-01T00:00:00.000Z,123,user.update,456,acc-1,"{""k"":1}"',
        ].join("\n"),
      );
      expect(setHeader).toHaveBeenCalledWith(
        expect.anything(),
        "content-type",
        "text/csv; charset=utf-8",
      );
      expect(setHeader).toHaveBeenCalledWith(
        expect.anything(),
        "content-disposition",
        'attachment; filename="admin-audit-log.csv"',
      );
      // CSV export uses a fixed page size instead of the query limit
      expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5000, where: {} }),
      );
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("GET /api/admin/integration-alerts", () => {
    const importHandler = async () =>
      (await import("../admin/integration-alerts.get")).default;

    it("returns filtered, paginated alerts", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const row = {
        id: 2,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        source: "plaid",
        kind: "webhook",
        message: "hello",
        httpStatus: 418,
        dedupeKey: "dk-1",
      };

      (getQuery as any).mockReturnValue({
        limit: "10",
        offset: "5",
        source: "plaid",
        kind: "webhook",
      });
      (prisma.integrationAlert.findMany as any).mockResolvedValue([row]);
      (prisma.integrationAlert.count as any).mockResolvedValue(1);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({ items: [row], total: 1, limit: 10, offset: 5 });
      expect(prisma.integrationAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source: "plaid", kind: { contains: "webhook" } },
          orderBy: { createdAt: "desc" },
          take: 10,
          skip: 5,
        }),
      );
    });

    it("does not filter by source when source=all", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getQuery as any).mockReturnValue({ limit: "10", offset: "0" });
      (prisma.integrationAlert.findMany as any).mockResolvedValue([]);
      (prisma.integrationAlert.count as any).mockResolvedValue(0);

      const handler = await importHandler();
      await handler({});

      const arg = (prisma.integrationAlert.findMany as any).mock.calls[0][0];
      expect(arg.where.source).toBeUndefined();
      expect(arg.where.kind).toBeUndefined();
    });

    it("returns CSV with download headers when format=csv", async () => {
      const { getQuery, setHeader } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getQuery as any).mockReturnValue({ format: "csv", source: "plaid" });
      (prisma.integrationAlert.findMany as any).mockResolvedValue([
        {
          id: 3,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          source: "plaid",
          kind: "webhook",
          message: "line1,\nline2",
          httpStatus: null,
          dedupeKey: "dk-2",
        },
      ]);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toBe(
        [
          "id,createdAt,source,kind,message,httpStatus,dedupeKey",
          '3,2024-01-01T00:00:00.000Z,plaid,webhook,"line1, line2",,dk-2',
        ].join("\n"),
      );
      expect(setHeader).toHaveBeenCalledWith(
        expect.anything(),
        "content-disposition",
        'attachment; filename="integration-alerts.csv"',
      );
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("GET /api/admin/integration-job-logs", () => {
    const importHandler = async () =>
      (await import("../admin/integration-job-logs.get")).default;

    it("returns filtered, paginated job logs", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const row = {
        id: 1,
        source: "plaid",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };

      (getQuery as any).mockReturnValue({
        limit: "3",
        offset: "6",
        source: "plaid",
      });
      (prisma.integrationJobLog.findMany as any).mockResolvedValue([row]);
      (prisma.integrationJobLog.count as any).mockResolvedValue(1);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({ items: [row], total: 1, limit: 3, offset: 6 });
      expect(prisma.integrationJobLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { source: { contains: "plaid" } },
          orderBy: { createdAt: "desc" },
          take: 3,
          skip: 6,
        }),
      );
    });

    it("uses an empty where clause when no source filter is given", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getQuery as any).mockReturnValue({ limit: "50", offset: "0" });
      (prisma.integrationJobLog.findMany as any).mockResolvedValue([]);
      (prisma.integrationJobLog.count as any).mockResolvedValue(0);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toMatchObject({ total: 0, limit: 50, offset: 0 });
      expect(prisma.integrationJobLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("GET /api/admin/notification-events", () => {
    const importHandler = async () =>
      (await import("../admin/notification-events.get")).default;

    it("returns filtered events with user and budget labels", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const firstSeenAt = new Date("2024-01-01T00:00:00.000Z");
      const lastSeenAt = new Date("2024-01-02T00:00:00.000Z");
      const updatedAt = new Date("2024-01-03T00:00:00.000Z");

      (getQuery as any).mockReturnValue({
        limit: "4",
        offset: "2",
        userId: "7",
        budgetId: "3",
        kind: "FORECAST_RISK",
        isActive: "true",
      });
      (prisma.notificationEvent.findMany as any).mockResolvedValue([
        {
          id: 10,
          userId: 7,
          budgetId: 3,
          kind: "FORECAST_RISK",
          fingerprint: "fp-1",
          occurrenceKey: "occ-1",
          isActive: true,
          payload: { reason: "low-balance" },
          firstSeenAt,
          lastSeenAt,
          resolvedAt: null,
          updatedAt,
          user: { id: 7, email: "u@example.com" },
          budget: { id: 3, name: "Home" },
        },
      ]);
      (prisma.notificationEvent.count as any).mockResolvedValue(1);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({
        items: [
          {
            id: 10,
            userId: 7,
            budgetId: 3,
            kind: "FORECAST_RISK",
            fingerprint: "fp-1",
            occurrenceKey: "occ-1",
            isActive: true,
            payload: { reason: "low-balance" },
            firstSeenAt,
            lastSeenAt,
            resolvedAt: null,
            updatedAt,
            userEmail: "u@example.com",
            budgetName: "Home",
          },
        ],
        total: 1,
        limit: 4,
        offset: 2,
      });
      expect(prisma.notificationEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 7,
            budgetId: 3,
            kind: "FORECAST_RISK",
            isActive: true,
          },
          orderBy: { lastSeenAt: "desc" },
          take: 4,
          skip: 2,
        }),
      );
    });

    it("applies lastSeenAt date bounds from from/to query params", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getQuery as any).mockReturnValue({
        limit: "50",
        offset: "0",
        from: "2024-01-01",
        to: "2024-01-31T00:00:00Z",
      });
      (prisma.notificationEvent.findMany as any).mockResolvedValue([]);
      (prisma.notificationEvent.count as any).mockResolvedValue(0);

      const handler = await importHandler();
      await handler({});

      expect(prisma.notificationEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            lastSeenAt: { gte: expect.any(Date), lte: expect.any(Date) },
          },
        }),
      );
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("GET /api/admin/plaid-sync-logs", () => {
    const importHandler = async () =>
      (await import("../admin/plaid-sync-logs.get")).default;

    it("returns filtered, paginated sync logs", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const row = {
        id: 1,
        userId: 11,
        syncMode: "item_cursor",
        status: "failed",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };

      (getQuery as any).mockReturnValue({
        limit: "9",
        offset: "1",
        syncMode: "item_cursor",
        status: "failed",
        userId: "11",
      });
      (prisma.plaidSyncLog.findMany as any).mockResolvedValue([row]);
      (prisma.plaidSyncLog.count as any).mockResolvedValue(1);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({ items: [row], total: 1, limit: 9, offset: 1 });
      expect(prisma.plaidSyncLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            syncMode: "item_cursor",
            status: "failed",
            userId: 11,
          },
          orderBy: { createdAt: "desc" },
          take: 9,
          skip: 1,
        }),
      );
    });

    it("uses an empty where clause without filters", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getQuery as any).mockReturnValue({ limit: "50", offset: "0" });
      (prisma.plaidSyncLog.findMany as any).mockResolvedValue([]);
      (prisma.plaidSyncLog.count as any).mockResolvedValue(0);

      const handler = await importHandler();
      await handler({});

      expect(prisma.plaidSyncLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("GET /api/admin/postmark/messages", () => {
    const importHandler = async () =>
      (await import("../admin/postmark/messages.get")).default;

    it("fetches outbound messages and maps them to the response shape", async () => {
      const { getQuery } = await import("h3");

      (getQuery as any).mockReturnValue({
        recipient: "user@example.com",
        count: "10",
      });
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          TotalCount: 2,
          Messages: [
            {
              MessageID: "m-1",
              To: "a@example.com, b@example.com",
              Subject: "Hello",
              Status: "Sent",
              ReceivedAt: "2024-01-01T00:00:00Z",
              Tag: "welcome",
            },
            {
              MessageID: "m-2",
              To: [{ Email: "c@example.com", Name: "C" }],
              Recipients: ["r1@example.com", "r2@example.com"],
              Subject: "World",
            },
          ],
        }),
      });

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({
        totalCount: 2,
        messages: [
          {
            messageId: "m-1",
            to: "a@example.com, b@example.com",
            subject: "Hello",
            status: "Sent",
            receivedAt: "2024-01-01T00:00:00Z",
            tag: "welcome",
          },
          {
            messageId: "m-2",
            to: "r1@example.com, r2@example.com",
            subject: "World",
            status: "",
            receivedAt: "",
            tag: "",
          },
        ],
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      const url = new URL(calledUrl);
      expect(`${url.protocol}//${url.host}${url.pathname}`).toBe(
        "https://api.postmarkapp.com/messages/outbound",
      );
      expect(url.searchParams.get("recipient")).toBe("user@example.com");
      expect(url.searchParams.get("count")).toBe("10");
      expect(calledInit.headers).toEqual({
        Accept: "application/json",
        "X-Postmark-Server-Token": "test-postmark-token",
      });
    });

    it("503 when the postmark token is not configured", async () => {
      const { getQuery } = await import("h3");
      envState.POSTMARK_SERVER_TOKEN = "";
      (getQuery as any).mockReturnValue({
        recipient: "user@example.com",
        count: "10",
      });

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 503 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("propagates upstream postmark errors", async () => {
      const { getQuery } = await import("h3");
      (getQuery as any).mockReturnValue({
        recipient: "user@example.com",
        count: "10",
      });
      fetchMock.mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "postmark exploded",
      });

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({
        statusCode: 502,
        statusMessage: "Postmark API error: postmark exploded",
      });
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/admin/system-status", () => {
    const importHandler = async () =>
      (await import("../admin/system-status.get")).default;

    it("reports healthy when database and redis respond", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      (prisma.$queryRaw as any).mockResolvedValue([{ "1": 1 }]);
      runtimeConfigState.value = {
        public: {
          bullBoardUrl: "https://bull.example.com",
          postmarkActivityBaseUrl: "https://pm.example.com",
        },
      };

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toMatchObject({
        app: { deployEnv: "local", nodeEnv: "test" },
        checks: { database: true, redis: true },
        links: {
          bullBoardUrl: "https://bull.example.com",
          postmarkActivityBaseUrl: "https://pm.example.com",
          externalLoggingUrl: null,
          runbookUrl: null,
        },
      });
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(redisMock.ping).toHaveBeenCalled();
    });

    it("reports degraded checks when database or redis fail", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");

      (prisma.$queryRaw as any).mockRejectedValueOnce(new Error("db down"));
      redisMock.ping.mockResolvedValueOnce("NOPE");

      const handler = await importHandler();
      const result = await handler({});

      expect(result.checks).toEqual({ database: false, redis: false });
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("POST /api/admin/microservice-reencrypt-migrate", () => {
    const importHandler = async () =>
      (await import("../admin/microservice-reencrypt-migrate.post")).default;

    it("forwards to the microservice migrate endpoint with the internal token", async () => {
      vi.stubEnv("INTERNAL_API_TOKEN", "internal-tok");
      vi.stubEnv("MICROSERVICE_INTERNAL_URL", "");
      runtimeConfigState.value = { microserviceInternalUrl: "http://ms:8080/" };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, migrated: 3 }),
      });

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({ ok: true, migrated: 3 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
        string,
        { method: string; headers: Record<string, string> },
      ];
      expect(calledUrl).toBe("http://ms:8080/migrate");
      expect(calledInit.method).toBe("POST");
      expect(calledInit.headers).toEqual({ "x-internal-token": "internal-tok" });

      const { setResponseStatus } = await import("h3");
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 200);

      const { prisma } = await import("~/server/clients/prismaClient");
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminUserId: 123,
          action: "microservice.reencrypt_migrate",
          targetUserId: null,
          targetAccountId: null,
          metadata: { microserviceStatus: 200 },
        },
      });
    });

    it("returns the raw body wrapped when the microservice responds non-JSON", async () => {
      vi.stubEnv("INTERNAL_API_TOKEN", "internal-tok");
      runtimeConfigState.value = { microserviceInternalUrl: "http://ms:8080" };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "plain-text-ok",
      });

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({ raw: "plain-text-ok" });
    });

    it("503 when the microservice is not configured", async () => {
      vi.stubEnv("INTERNAL_API_TOKEN", "");
      vi.stubEnv("MICROSERVICE_INTERNAL_URL", "");
      runtimeConfigState.value = { microserviceInternalUrl: "" };

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({
        statusCode: 503,
        statusMessage: expect.stringContaining("must be configured"),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("propagates microservice errors with their status and message", async () => {
      vi.stubEnv("INTERNAL_API_TOKEN", "internal-tok");
      runtimeConfigState.value = { microserviceInternalUrl: "http://ms:8080" };
      fetchMock.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => JSON.stringify({ message: "migration failed" }),
      });

      const { handleApiError } = await import("~/server/lib/handleApiError");

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({
        statusCode: 422,
        statusMessage: "migration failed",
      });
      // h3-style errors are re-thrown before generic error handling
      expect(handleApiError).not.toHaveBeenCalled();
    });

    it("rejects non-admins with 403 without calling the microservice", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
