import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~/server/clients/prismaClient";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn(
    (error: {
      statusCode?: number;
      statusMessage?: string;
      message?: string;
    }) => {
      const statusCode = error.statusCode || 500;
      const message = error.statusMessage || error.message || "Unknown error";
      const fullMessage = `HTTP ${statusCode}: ${message}`;
      const err = new Error(fullMessage) as Error & {
        statusCode?: number;
        statusMessage?: string;
      };
      err.statusCode = statusCode;
      err.statusMessage = message;
      throw err;
    },
  ),
  readBody: vi.fn(),
  getQuery: vi.fn(),
  setResponseStatus: vi.fn(),
}));

(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/services/accountSnapshotService", () => ({
  assertUserOwnsAccount: vi.fn().mockResolvedValue(undefined),
  createAccountSnapshot: vi.fn().mockResolvedValue({
    id: "snap-uuid-1",
    createdAt: new Date("2024-06-01T12:00:00.000Z"),
  }),
}));

vi.mock("~/server/lib/normalizePlaidDescription", () => ({
  normalizePlaidDescription: vi.fn((s: string) => s.trim() || ""),
}));

const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440000";
const CAT_ID = "650e8400-e29b-41d4-a716-446655440001";

async function resetH3Mocks() {
  const { readBody, getQuery } = await import("h3");
  (readBody as any).mockReset();
  (readBody as any).mockResolvedValue({});
  (getQuery as any).mockReset();
  (getQuery as any).mockReturnValue({});
  (globalThis as any).readBody = readBody;
  (globalThis as any).getQuery = getQuery;
}

describe("categories, snapshots, savings-goal, match-reoccurrence API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetH3Mocks();
    prisma.$transaction.mockImplementation(
      async (fn: (_tx: unknown) => Promise<unknown>) => {
        const tx = {
          reoccurrencePlaidNameAlias: {
            upsert: prisma.reoccurrencePlaidNameAlias.upsert,
          },
          registerEntry: { update: prisma.registerEntry.update },
        };
        return fn(tx);
      },
    );
  });

  describe("GET /api/categories", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../categories.get");
      handler = mod.default;
    });

    it("returns categories for user", async () => {
      const rows = [
        {
          id: CAT_ID,
          name: "Food",
          accountId: ACCOUNT_ID,
          subCategoryId: null,
          isArchived: false,
        },
      ];
      prisma.category.findMany.mockResolvedValue(rows);
      const { getUser } = await import("~/server/lib/getUser");
      const { getQuery } = await import("h3");
      (getUser as any).mockReturnValue({ userId: 1 });
      (getQuery as any).mockReturnValue({});

      const out = await handler({});
      expect(out).toEqual(rows);
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: false }),
          orderBy: { name: "asc" },
        }),
      );
    });

    it("filters by accountId when provided", async () => {
      prisma.category.findMany.mockResolvedValue([]);
      const { getUser } = await import("~/server/lib/getUser");
      const { getQuery } = await import("h3");
      (getUser as any).mockReturnValue({ userId: 1 });
      (getQuery as any).mockReturnValue({ accountId: ACCOUNT_ID });

      await handler({});
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ accountId: ACCOUNT_ID }),
        }),
      );
    });
  });

  describe("POST /api/category", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../category.post");
      handler = mod.default;
    });

    it("creates category", async () => {
      const created = {
        id: CAT_ID,
        name: "New",
        accountId: ACCOUNT_ID,
        subCategoryId: null,
        isArchived: false,
        updatedAt: new Date(),
      };
      prisma.account.findFirstOrThrow.mockResolvedValue({ id: ACCOUNT_ID });
      prisma.category.create.mockResolvedValue(created);
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      (readBody as any).mockResolvedValue({
        accountId: ACCOUNT_ID,
        name: "New",
      });
      (getUser as any).mockReturnValue({ userId: 1 });

      const out = await handler({});
      expect((out as { name: string }).name).toBe("New");
      expect(prisma.category.create).toHaveBeenCalled();
    });
  });

  describe("PATCH /api/category", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../category.patch");
      handler = mod.default;
    });

    it("updates category", async () => {
      const updated = {
        id: CAT_ID,
        name: "Renamed",
        accountId: ACCOUNT_ID,
        subCategoryId: null,
        isArchived: false,
        updatedAt: new Date(),
      };
      prisma.category.findFirstOrThrow.mockResolvedValue({ id: CAT_ID });
      prisma.category.update.mockResolvedValue(updated);
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      (readBody as any).mockResolvedValue({ id: CAT_ID, name: "Renamed" });
      (getUser as any).mockReturnValue({ userId: 1 });

      const out = await handler({});
      expect((out as { name: string }).name).toBe("Renamed");
    });
  });

  describe("DELETE /api/category", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../category.delete");
      handler = mod.default;
    });

    it("deletes when no register entries", async () => {
      const deleted = {
        id: CAT_ID,
        name: "X",
        accountId: ACCOUNT_ID,
        subCategoryId: null,
        isArchived: false,
        updatedAt: new Date(),
      };
      prisma.category.findFirstOrThrow.mockResolvedValue({ id: CAT_ID });
      prisma.registerEntry.count.mockResolvedValue(0);
      prisma.category.delete.mockResolvedValue(deleted);
      const { getUser } = await import("~/server/lib/getUser");
      const { getQuery } = await import("h3");
      (getUser as any).mockReturnValue({ userId: 1 });
      (getQuery as any).mockReturnValue({ id: CAT_ID });
      (globalThis as any).getQuery.mockReturnValue({ id: CAT_ID });

      const out = await handler({});
      expect(prisma.category.delete).toHaveBeenCalled();
      expect((out as { id: string }).id).toBe(CAT_ID);
    });

    it("archives when register entries exist", async () => {
      const archived = {
        id: CAT_ID,
        name: "X",
        accountId: ACCOUNT_ID,
        subCategoryId: null,
        isArchived: true,
        updatedAt: new Date(),
      };
      prisma.category.findFirstOrThrow.mockResolvedValue({ id: CAT_ID });
      prisma.registerEntry.count.mockResolvedValue(3);
      prisma.category.update.mockResolvedValue(archived);
      const { getUser } = await import("~/server/lib/getUser");
      const { getQuery } = await import("h3");
      (getUser as any).mockReturnValue({ userId: 1 });
      (getQuery as any).mockReturnValue({ id: CAT_ID });
      (globalThis as any).getQuery.mockReturnValue({ id: CAT_ID });

      await handler({});
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: CAT_ID },
        data: { isArchived: true },
      });
    });
  });

  describe("POST /api/snapshot", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../snapshot.post");
      handler = mod.default;
    });

    it("creates snapshot", async () => {
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { createAccountSnapshot } =
        await import("~/server/services/accountSnapshotService");
      (readBody as any).mockResolvedValue({ accountId: ACCOUNT_ID });
      (getUser as any).mockReturnValue({ userId: 1 });

      const out = await handler({});
      expect(createAccountSnapshot).toHaveBeenCalledWith(ACCOUNT_ID);
      expect(out).toEqual({
        id: "snap-uuid-1",
        createdAt: "2024-06-01T12:00:00.000Z",
      });
    });
  });

  describe("GET /api/snapshots", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../snapshots.get");
      handler = mod.default;
    });

    it("lists snapshots", async () => {
      const d = new Date("2024-01-02T00:00:00.000Z");
      prisma.accountSnapshot.findMany.mockResolvedValue([
        { id: "s1", createdAt: d },
      ]);
      const { getUser } = await import("~/server/lib/getUser");
      const { getQuery } = await import("h3");
      (getUser as any).mockReturnValue({ userId: 1 });
      (getQuery as any).mockReturnValue({ accountId: ACCOUNT_ID });
      (globalThis as any).getQuery.mockReturnValue({ accountId: ACCOUNT_ID });

      const out = await handler({});
      expect(out).toEqual([{ id: "s1", createdAt: d.toISOString() }]);
    });
  });

  describe("POST /api/savings-goal", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../savings-goal.post");
      handler = mod.default;
    });

    it("creates savings goal", async () => {
      const source = {
        id: 10,
        budgetId: 1,
        accountId: ACCOUNT_ID,
        isArchived: false,
        account: {
          id: ACCOUNT_ID,
          userAccounts: [{ userId: 99 }],
        },
      };
      const target = {
        id: 11,
        budgetId: 1,
        accountId: ACCOUNT_ID,
        isArchived: false,
        account: {
          userAccounts: [{ userId: 99 }],
        },
      };
      prisma.accountRegister.findFirst
        .mockResolvedValueOnce(source as any)
        .mockResolvedValueOnce(target as any);
      prisma.savingsGoal.aggregate.mockResolvedValue({
        _max: { sortOrder: 0 },
      });
      prisma.savingsGoal.create.mockResolvedValue({
        id: 5,
        accountId: ACCOUNT_ID,
        budgetId: 1,
        name: "Goal",
        targetAmount: 1000,
        sourceAccountRegisterId: 10,
        targetAccountRegisterId: 11,
        priorityOverDebt: false,
        ignoreMinBalance: false,
        categoryId: null,
        sortOrder: 1,
        isArchived: false,
      });
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { setResponseStatus } = await import("h3");
      (readBody as any).mockResolvedValue({
        name: "Goal",
        targetAmount: 1000,
        sourceAccountRegisterId: 10,
        targetAccountRegisterId: 11,
      });
      (getUser as any).mockReturnValue({ userId: 99 });

      const out = await handler({});
      expect(setResponseStatus).toHaveBeenCalledWith(expect.anything(), 201);
      expect((out as { name: string }).name).toBe("Goal");
    });

    it("404 when source register missing", async () => {
      prisma.accountRegister.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      (readBody as any).mockResolvedValue({
        name: "Goal",
        targetAmount: 1000,
        sourceAccountRegisterId: 10,
        targetAccountRegisterId: 11,
      });
      (getUser as any).mockReturnValue({ userId: 99 });

      await expect(handler({})).rejects.toThrow();
    });
  });

  describe("POST /api/register-entry-match-reoccurrence", () => {
    let handler: any;

    beforeEach(async () => {
      const { normalizePlaidDescription } =
        await import("~/server/lib/normalizePlaidDescription");
      (normalizePlaidDescription as any).mockImplementation((s: string) =>
        s.trim(),
      );

      const mod = await import("../register-entry-match-reoccurrence.post");
      handler = mod.default;
    });

    it("rejects when entry missing", async () => {
      prisma.registerEntry.findFirst.mockResolvedValue(null);
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      (readBody as any).mockResolvedValue({
        registerEntryId: "e1",
        accountRegisterId: 1,
        reoccurrenceId: 2,
      });
      (getUser as any).mockReturnValue({ userId: 1 });

      await expect(handler({})).rejects.toThrow(/400/);
    });

    it("rejects when not plaid-imported", async () => {
      prisma.registerEntry.findFirst.mockResolvedValue({
        id: "e1",
        plaidId: null,
        description: "Cash",
        accountRegisterId: 1,
      });
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      (readBody as any).mockResolvedValue({
        registerEntryId: "e1",
        accountRegisterId: 1,
        reoccurrenceId: 2,
      });
      (getUser as any).mockReturnValue({ userId: 1 });

      await expect(handler({})).rejects.toThrow(/bank-imported/);
    });

    it("matches and updates entry", async () => {
      prisma.registerEntry.findFirst.mockResolvedValue({
        id: "entry-1",
        plaidId: "plaid-x",
        description: "Coffee Shop",
        accountRegisterId: 5,
      });
      prisma.reoccurrence.findFirstOrThrow.mockResolvedValue({ id: 2 });
      prisma.registerEntry.findUniqueOrThrow.mockResolvedValue({
        id: "entry-1",
        accountRegisterId: 5,
        description: "Coffee Shop",
        reoccurrenceId: 2,
        amount: 5,
        balance: 0,
        isPending: false,
        hasBalanceReCalc: true,
      });
      prisma.accountRegister.findUniqueOrThrow.mockResolvedValue({
        accountId: ACCOUNT_ID,
      });
      const { readBody } = await import("h3");
      const { getUser } = await import("~/server/lib/getUser");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");
      (readBody as any).mockResolvedValue({
        registerEntryId: "entry-1",
        accountRegisterId: 5,
        reoccurrenceId: 2,
      });
      (getUser as any).mockReturnValue({ userId: 1 });

      await handler({});
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: ACCOUNT_ID });
    });
  });
});
