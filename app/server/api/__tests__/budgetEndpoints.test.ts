import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error: any) => {
    const err = new Error(
      `HTTP ${error.statusCode || 500}: ${error.statusMessage || error.message || "Unknown error"}`,
    ) as any;
    err.statusCode = error.statusCode || 500;
    err.statusMessage = error.statusMessage || error.message;
    throw err;
  }),
  readBody: vi.fn(),
  setResponseStatus: vi.fn(),
  getRouterParam: vi.fn(),
}));

vi.mock("~/server/logger", () => ({ log: vi.fn() }));

const defaultUserAccountMembership = {
  userId: 123,
  accountId: "acc-1",
  canViewBudgets: true,
  canInviteUsers: true,
  canManageMembers: true,
  allowedBudgetIds: null,
  allowedAccountRegisterIds: null,
};

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
}));

vi.mock("~/server/lib/getUser", () => ({ getUser: vi.fn() }));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn((err: any) => {
    if (err && typeof err === "object" && err.statusCode) throw err;
  }),
}));

vi.mock("~/server/services/budgetCloneService", () => ({
  cloneBudget: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/services/accountWorkspaceCloneService", () => ({
  duplicateAccountWorkspace: vi.fn(),
}));

vi.mock("~/schema/zod", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/schema/zod")>();
  return { ...actual };
});

const mockUser = { userId: 123 };
const defaultBudget = {
  id: 1,
  accountId: "acc-1",
  userId: 123,
  isDefault: true,
  name: "Default",
  isArchived: false,
};
const newBudget = {
  id: 2,
  name: "Vacation",
  accountId: "acc-1",
  isArchived: false,
  isDefault: false,
  userId: 123,
};

describe("Budget API Endpoints", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getUser } = await import("~/server/lib/getUser");
    (getUser as any).mockReturnValue(mockUser);
    const prisma = (await import("~/server/clients/prismaClient"))
      .prisma as any;
    prisma.userAccount.findFirst.mockResolvedValue(defaultUserAccountMembership);
  });

  describe("POST /api/budget", () => {
    let handler: (_event: any) => Promise<any>;

    beforeEach(async () => {
      const mod = await import("../budget.post");
      handler = mod.default;
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockResolvedValue(defaultBudget);
      prisma.budget.count.mockResolvedValue(5);
      prisma.$transaction.mockImplementation(
        async (cb: (_tx: any) => Promise<any>) => {
          const tx = {
            budget: { create: vi.fn().mockResolvedValue(newBudget) },
          };
          return cb(tx);
        },
      );
      const { readBody } = (await import("h3")) as any;
      readBody.mockResolvedValue({ name: "Vacation" });
    });

    it("returns 201 and budget when default exists and under limit", async () => {
      const event = {};
      const { setResponseStatus } = (await import("h3")) as any;
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      const { cloneBudget } =
        await import("~/server/services/budgetCloneService");

      const result = await handler(event);

      expect(setResponseStatus).toHaveBeenCalledWith(event, 201);
      expect(result).toMatchObject({
        id: 2,
        name: "Vacation",
        accountId: "acc-1",
        isArchived: false,
        isDefault: false,
        userId: 123,
      });
      expect(prisma.budget.findFirst).toHaveBeenCalledWith({
        where: {
          isDefault: true,
          account: {
            userAccounts: { some: { userId: 123 } },
          },
        },
      });
      expect(prisma.budget.count).toHaveBeenCalledWith({
        where: { userId: 123, isArchived: false },
      });
      expect(cloneBudget).toHaveBeenCalledWith(
        expect.anything(),
        defaultBudget.id,
        newBudget.id,
        defaultBudget.accountId,
      );
    });

    it("throws 400 when no default budget", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Default budget not found",
      });
    });

    it("throws 400 when max budgets reached", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.count.mockResolvedValue(10);

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Maximum budgets (10) reached.",
      });
    });

    it("throws on invalid body (missing name)", async () => {
      const { readBody } = (await import("h3")) as any;
      readBody.mockResolvedValue({});

      await expect(handler({})).rejects.toThrow();
    });

    it("duplicates financial account, recalculates, and returns new budget", async () => {
      const { readBody } = (await import("h3")) as any;
      readBody.mockResolvedValue({
        name: "Vacation",
        duplicateFinancialAccount: true,
      });
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      const { duplicateAccountWorkspace } =
        await import("~/server/services/accountWorkspaceCloneService");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      const { cloneBudget } =
        await import("~/server/services/budgetCloneService");

      vi.mocked(duplicateAccountWorkspace).mockResolvedValue({
        accountId: "acc-new",
        budgetId: 44,
      });
      prisma.$transaction.mockImplementation(
        async (cb: (_tx: unknown) => Promise<unknown>) => cb({}),
      );
      prisma.budget.findFirstOrThrow.mockResolvedValue({
        id: 44,
        name: "Vacation",
        accountId: "acc-new",
        isArchived: false,
        isDefault: false,
        userId: 123,
      });

      const result = await handler({});

      expect(duplicateAccountWorkspace).toHaveBeenCalled();
      expect(cloneBudget).not.toHaveBeenCalled();
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "acc-new" });
      expect(result).toMatchObject({
        id: 44,
        name: "Vacation",
        accountId: "acc-new",
        userId: 123,
      });
    });
  });

  describe("DELETE /api/budget/:id", () => {
    let handler: (_event: any) => Promise<any>;

    beforeEach(async () => {
      const mod = await import("../budget/[id].delete");
      handler = mod.default;
      const { getRouterParam } = (await import("h3")) as any;
      getRouterParam.mockImplementation((_: any, key: string) =>
        key === "id" ? "2" : undefined,
      );
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockResolvedValue({
        id: 2,
        accountId: "acc-1",
        isDefault: false,
      });
      prisma.$transaction.mockImplementation(
        async (cb: (_tx: any) => Promise<any>) => {
          const tx = {
            accountRegister: {
              updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
            budget: { update: vi.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        },
      );
    });

    it("archives budget and calls addRecalculateJob", async () => {
      const result = await handler({});

      expect(result).toEqual({ message: "Budget archived." });
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "acc-1" });
    });

    it("throws 400 for invalid id", async () => {
      const { getRouterParam } = (await import("h3")) as any;
      getRouterParam.mockReturnValue("abc");

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Invalid budget id",
      });
    });

    it("throws 404 when budget not found", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: "Budget not found",
      });
    });

    it("throws 400 when deleting default budget", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockResolvedValue({
        id: 1,
        accountId: "acc-1",
        isDefault: true,
      });

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Cannot delete the default budget",
      });
    });
  });

  describe("PATCH /api/budget/:id", () => {
    let handler: (_event: any) => Promise<any>;

    beforeEach(async () => {
      const mod = await import("../budget/[id].patch");
      handler = mod.default;
      const { getRouterParam, readBody } = (await import("h3")) as any;
      getRouterParam.mockImplementation((_: any, key: string) =>
        key === "id" ? "2" : undefined,
      );
      readBody.mockResolvedValue({ name: "New Name" });
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockResolvedValue({
        id: 2,
        accountId: "acc-1",
        isDefault: false,
      });
      prisma.budget.update.mockResolvedValue({
        id: 2,
        name: "New Name",
        accountId: "acc-1",
        isArchived: false,
        isDefault: false,
        userId: 123,
      });
    });

    it("returns updated budget", async () => {
      const result = await handler({});

      expect(result).toMatchObject({
        id: 2,
        name: "New Name",
        accountId: "acc-1",
        isArchived: false,
        isDefault: false,
        userId: 123,
      });
    });

    it("throws 400 for invalid id", async () => {
      const { getRouterParam } = (await import("h3")) as any;
      getRouterParam.mockReturnValue("0");

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Invalid budget id",
      });
    });

    it("throws 404 when budget not found", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: "Budget not found",
      });
    });

    it("throws 400 when renaming default budget", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockResolvedValue({
        id: 1,
        accountId: "acc-1",
        isDefault: true,
      });

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Cannot rename the default budget",
      });
    });

    it("throws on invalid body (empty name)", async () => {
      const { readBody } = (await import("h3")) as any;
      readBody.mockResolvedValue({ name: "" });

      await expect(handler({})).rejects.toThrow();
    });
  });

  describe("POST /api/budget/:id/reset", () => {
    let handler: (_event: any) => Promise<any>;

    beforeEach(async () => {
      const mod = await import("../budget/[id]/reset.post");
      handler = mod.default;
      const { getRouterParam } = (await import("h3")) as any;
      getRouterParam.mockImplementation((_: any, key: string) =>
        key === "id" ? "2" : undefined,
      );
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst
        .mockResolvedValueOnce({
          id: 2,
          accountId: "acc-1",
          isDefault: false,
        })
        .mockResolvedValueOnce({
          id: 1,
          accountId: "acc-1",
          isDefault: true,
        });
      const mockTx = {
        accountRegister: {
          findMany: vi.fn().mockResolvedValue([{ id: 10 }, { id: 11 }]),
          deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        reoccurrence: {
          findMany: vi.fn().mockResolvedValue([{ id: 1 }]),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        registerEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        reoccurrencePlaidNameAlias: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        reoccurrenceSplit: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        reoccurrenceSkip: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      prisma.$transaction.mockImplementation(
        async (cb: (_tx: any) => Promise<any>) => cb(mockTx),
      );
    });

    it("resets budget from default and calls addRecalculateJob", async () => {
      const result = await handler({});

      expect(result).toEqual({ message: "Budget reset from default." });
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "acc-1" });
      const { cloneBudget } =
        await import("~/server/services/budgetCloneService");
      expect(cloneBudget).toHaveBeenCalledWith(
        expect.anything(),
        1,
        2,
        "acc-1",
      );
    });

    it("throws 400 for invalid id", async () => {
      const { getRouterParam } = (await import("h3")) as any;
      getRouterParam.mockReturnValue("x");

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Invalid budget id",
      });
    });

    it("throws 404 when budget not found", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockReset();
      prisma.budget.findFirst.mockResolvedValue(null);

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: "Budget not found",
      });
    });

    it("throws 400 when resetting default budget", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockReset();
      prisma.budget.findFirst.mockResolvedValue({
        id: 1,
        accountId: "acc-1",
        isDefault: true,
      });

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Cannot reset the default budget",
      });
    });

    it("throws 400 when default budget not found", async () => {
      const prisma = (await import("~/server/clients/prismaClient"))
        .prisma as any;
      prisma.budget.findFirst.mockReset();
      prisma.budget.findFirst
        .mockResolvedValueOnce({ id: 2, accountId: "acc-1", isDefault: false })
        .mockResolvedValueOnce(null);

      await expect(handler({})).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Default budget not found",
      });
    });
  });
});
