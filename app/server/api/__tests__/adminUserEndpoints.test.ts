import { describe, it, expect, vi, beforeEach } from "vitest";

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
  setResponseStatus: vi.fn(),
}));

// Make H3 functions globally available
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();
(globalThis as any).getRouterParam = vi.fn();

const envState = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock("~/server/env", () => ({ default: envState }));

const resetHashMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue("hashed-password"),
);

// Mock server dependencies
vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/services/HashService", () => ({
  default: vi.fn().mockImplementation(function () {
    return { hash: resetHashMock };
  }),
}));

vi.mock("~/server/lib/rotateUserJwtKey", () => ({
  rotateUserJwtKey: vi.fn().mockResolvedValue(undefined),
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

describe("Admin User API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
    (globalThis as any).getRouterParam = vi.fn();
  });

  describe("GET /api/admin/users", () => {
    const importHandler = async () =>
      (await import("../admin/users.get")).default;

    it("returns paginated users with normalized roles and account counts", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const updatedAt = new Date("2024-01-01T00:00:00.000Z");

      (getQuery as any).mockReturnValue({ limit: "10", offset: "0" });
      (prisma.user.findMany as any).mockResolvedValue([
        {
          id: 1,
          firstName: "Ada",
          lastName: "Smith",
          email: "admin@dineros.cc", // admin email without stored ADMIN role
          role: null,
          isArchived: 0,
          updatedAt,
          countryId: "US",
          timezoneOffset: -5,
          isDaylightSaving: true,
          _count: { accounts: 3 },
        },
        {
          id: 2,
          firstName: "Bob",
          lastName: "Jones",
          email: "bob@example.com",
          role: "USER",
          isArchived: true,
          updatedAt,
          countryId: null,
          timezoneOffset: null,
          isDaylightSaving: null,
          _count: { accounts: 0 },
        },
      ]);
      (prisma.user.count as any).mockResolvedValue(2);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({
        items: [
          {
            id: 1,
            firstName: "Ada",
            lastName: "Smith",
            email: "admin@dineros.cc",
            role: "ADMIN",
            isArchived: false,
            countryId: "US",
            timezoneOffset: -5,
            isDaylightSaving: true,
            updatedAt,
            accountCount: 3,
          },
          {
            id: 2,
            firstName: "Bob",
            lastName: "Jones",
            email: "bob@example.com",
            role: "USER",
            isArchived: true,
            countryId: null,
            timezoneOffset: null,
            isDaylightSaving: null,
            updatedAt,
            accountCount: 0,
          },
        ],
        total: 2,
        limit: 10,
        offset: 0,
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: undefined,
          orderBy: { updatedAt: "desc" },
          take: 10,
          skip: 0,
        }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({ where: undefined });
    });

    it("includes numeric ids in the search clause", async () => {
      const { getQuery } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getQuery as any).mockReturnValue({ q: "42", limit: "10", offset: "0" });
      (prisma.user.findMany as any).mockResolvedValue([]);
      (prisma.user.count as any).mockResolvedValue(0);

      const handler = await importHandler();
      await handler({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: expect.arrayContaining([{ id: 42 }]),
          },
        }),
      );
    });

    it("rejects non-admins with 403", async () => {
      const { prisma } = await import("~/server/clients/prismaClient");
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/admin/users/:id", () => {
    const importHandler = async () =>
      (await import("../admin/users/[id].patch")).default;

    it("updates the user, records an audit row, and returns the safe shape", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const updatedAt = new Date("2024-01-01T00:00:00.000Z");

      (getRouterParam as any).mockReturnValue("5");
      (readBody as any).mockResolvedValue({ firstName: "  New  ", role: "ADMIN" });
      (prisma.user.update as any).mockResolvedValue({
        id: 5,
        firstName: "New",
        lastName: "Smith",
        email: "ada@example.com",
        role: "ADMIN",
        isArchived: false,
        countryId: null,
        timezoneOffset: null,
        isDaylightSaving: null,
        updatedAt,
      });

      const handler = await importHandler();
      const result = await handler({});

      // The zod schema trims string input before it reaches prisma
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { firstName: "New", role: "ADMIN" },
        select: expect.any(Object),
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminUserId: 123,
          action: "user.update",
          targetUserId: 5,
          targetAccountId: null,
          metadata: { fields: ["firstName", "role"] },
        },
      });
      expect(result).toEqual({
        id: 5,
        firstName: "New",
        lastName: "Smith",
        email: "ada@example.com",
        role: "ADMIN",
        isArchived: false,
        countryId: null,
        timezoneOffset: null,
        isDaylightSaving: null,
        updatedAt,
      });
    });

    it("400 for non-integer or non-positive user ids", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      const handler = await importHandler();

      (getRouterParam as any).mockReturnValue("not-a-number");
      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });

      (getRouterParam as any).mockReturnValue("0");
      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects an empty update body via schema validation", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (getRouterParam as any).mockReturnValue("5");
      (readBody as any).mockResolvedValue({});

      const handler = await importHandler();
      await expect(handler({})).rejects.toThrow();

      expect(handleApiError).toHaveBeenCalledWith(expect.anything());
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("GET /api/admin/users/:id/plaid", () => {
    const importHandler = async () =>
      (await import("../admin/users/[id]/plaid.get")).default;

    it("returns the user's plaid items with sync cursor state", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const updatedAt = new Date("2024-01-01T00:00:00.000Z");
      const cursorAt = new Date("2024-01-02T00:00:00.000Z");

      (getRouterParam as any).mockReturnValue("7");
      (prisma.user.findUnique as any).mockResolvedValue({ id: 7 });
      (prisma.plaidItem.findMany as any).mockResolvedValue([
        { itemId: "item-1", userId: 7, updatedAt },
        { itemId: "item-2", userId: 7, updatedAt },
      ]);
      (prisma.plaidSyncCursor.findMany as any).mockResolvedValue([
        { itemId: "item-2", updatedAt: cursorAt },
      ]);

      const handler = await importHandler();
      const result = await handler({});

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
        select: { id: true },
      });
      expect(prisma.plaidItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 7 },
          orderBy: { updatedAt: "desc" },
        }),
      );
      expect(prisma.plaidSyncCursor.findMany).toHaveBeenCalledWith({
        where: { itemId: { in: ["item-1", "item-2"] } },
        select: { itemId: true, updatedAt: true },
      });
      expect(result).toEqual({
        items: [
          { itemId: "item-1", userId: 7, updatedAt, syncCursorUpdatedAt: null },
          {
            itemId: "item-2",
            userId: 7,
            updatedAt,
            syncCursorUpdatedAt: cursorAt,
          },
        ],
      });
    });

    it("skips the cursor lookup when the user has no plaid items", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("7");
      (prisma.user.findUnique as any).mockResolvedValue({ id: 7 });
      (prisma.plaidItem.findMany as any).mockResolvedValue([]);

      const handler = await importHandler();
      const result = await handler({});

      expect(result).toEqual({ items: [] });
      expect(prisma.plaidSyncCursor.findMany).not.toHaveBeenCalled();
    });

    it("404 when the user does not exist", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("7");
      (prisma.user.findUnique as any).mockResolvedValue(null);

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
      expect(prisma.plaidItem.findMany).not.toHaveBeenCalled();
    });

    it("400 for invalid user ids", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("abc");

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("POST /api/admin/users/:id/reset-password", () => {
    const importHandler = async () =>
      (await import("../admin/users/[id]/reset-password.post")).default;

    it("hashes the new password, rotates the jwt key, and audits", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { rotateUserJwtKey } = await import(
        "~/server/lib/rotateUserJwtKey"
      );

      (getRouterParam as any).mockReturnValue("9");
      (readBody as any).mockResolvedValue({
        newPassword: "NewPassword123",
        confirmPassword: "NewPassword123",
      });
      (prisma.user.update as any).mockResolvedValue({ id: 9 });

      const handler = await importHandler();
      const result = await handler({});

      expect(resetHashMock).toHaveBeenCalledWith("NewPassword123");
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { password: "hashed-password" },
        select: { id: true },
      });
      expect(rotateUserJwtKey).toHaveBeenCalledWith(9);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminUserId: 123,
          action: "user.password_reset",
          targetUserId: 9,
          targetAccountId: null,
          metadata: undefined,
        },
      });
      expect(result).toEqual({ message: "Password reset successfully." });
    });

    it("rejects mismatched password confirmation via schema validation", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { rotateUserJwtKey } = await import(
        "~/server/lib/rotateUserJwtKey"
      );

      (getRouterParam as any).mockReturnValue("9");
      (readBody as any).mockResolvedValue({
        newPassword: "NewPassword123",
        confirmPassword: "Different123",
      });

      const handler = await importHandler();
      await expect(handler({})).rejects.toThrow();

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(rotateUserJwtKey).not.toHaveBeenCalled();
    });

    it("400 for invalid user ids", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("0");

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects non-admins with 403", async () => {
      const { requireAdmin } = await import("~/server/lib/requireAdmin");
      (requireAdmin as any).mockRejectedValueOnce(forbiddenError());

      const handler = await importHandler();
      await expect(handler({})).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
