import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn(
    (error: { statusCode?: number; statusMessage?: string }) => {
      const err = new Error(error.statusMessage || "err") as Error & {
        statusCode?: number;
      };
      err.statusCode = error.statusCode || 500;
      throw err;
    },
  ),
  getQuery: vi.fn(),
  getRouterParam: vi.fn(),
}));

(globalThis as any).getQuery = vi.fn();

const prismaMock = vi.hoisted(() => ({
  savingsGoal: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  accountSnapshot: {
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  accountRegisterSnapshot: {
    findFirst: vi.fn(),
  },
}));

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/server/services/reports/CategoryReportService", () => ({
  getCategoryReport: vi.fn().mockResolvedValue({
    summary: {
      totalIn: 0,
      totalOut: 0,
      net: 0,
      transactionCount: 0,
      sumAbs: 0,
    },
    donutCategories: [],
    tableGroups: [],
  }),
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    nowDate: vi.fn(() => new Date("2024-06-01T12:00:00.000Z")),
    now: vi.fn(() => ({ toISOString: () => "2024-01-01T00:00:00.000Z" })),
  },
}));

describe("reports / savings-goal / snapshot nested routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/reports/categories", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../reports/categories.get");
      handler = mod.default;
    });

    it("returns category report", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { getQuery } = await import("h3");
      const { getCategoryReport } =
        await import("~/server/services/reports/CategoryReportService");

      (getUser as any).mockReturnValue({ userId: 42 });
      (getQuery as any).mockReturnValue({
        budgetId: "1",
        mode: "past",
        dateFrom: "2024-01-01",
        dateTo: "2024-01-31",
      });
      (globalThis as any).getQuery.mockReturnValue({
        budgetId: "1",
        mode: "past",
        dateFrom: "2024-01-01",
        dateTo: "2024-01-31",
      });

      await handler({});
      expect(getCategoryReport).toHaveBeenCalledWith({
        userId: 42,
        query: expect.objectContaining({ budgetId: 1, mode: "past" }),
      });
    });
  });

  describe("DELETE /api/savings-goal/:id", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../savings-goal/[id].delete");
      handler = mod.default;
    });

    it("archives goal and enqueues recalculate", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { getRouterParam } = await import("h3");
      const { addRecalculateJob } =
        await import("~/server/clients/queuesClient");

      (getUser as any).mockReturnValue({ userId: 7 });
      (getRouterParam as any).mockReturnValue("12");
      prismaMock.savingsGoal.findFirst.mockResolvedValue({
        id: 12,
        accountId: "acc-1",
      });
      prismaMock.savingsGoal.update.mockResolvedValue({});

      const out = await handler({});
      expect(out).toEqual({ message: "Savings goal archived." });
      expect(prismaMock.savingsGoal.update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: { isArchived: true },
      });
      expect(addRecalculateJob).toHaveBeenCalledWith({ accountId: "acc-1" });
    });
  });

  describe("GET /api/snapshot/:id", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../snapshot/[id].get");
      handler = mod.default;
    });

    it("returns snapshot with registers", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const created = new Date("2024-03-01T00:00:00.000Z");
      prismaMock.accountSnapshot.findFirst.mockResolvedValue({
        id: 1,
        accountId: "a1",
        createdAt: created,
        registers: [
          {
            id: 10,
            accountRegisterId: 5,
            subAccountRegisterId: null,
            collateralAssetRegisterId: null,
            name: "Checking",
            balance: "100",
            latestBalance: "100",
            typeId: 1,
          },
        ],
      });
      (getUser as any).mockReturnValue({ userId: 1 });

      const out = await handler({
        context: { params: { id: "1" } },
      } as any);

      expect((out as { id: number }).id).toBe(1);
      expect((out as { registers: unknown[] }).registers).toHaveLength(1);
    });
  });

  describe("DELETE /api/snapshot/:id", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../snapshot/[id].delete");
      handler = mod.default;
    });

    it("deletes snapshot", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      prismaMock.accountSnapshot.findFirst.mockResolvedValue({ id: 2 });
      prismaMock.accountSnapshot.delete.mockResolvedValue({});
      (getUser as any).mockReturnValue({ userId: 1 });

      const out = await handler({
        context: { params: { id: "2" } },
      } as any);

      expect(out).toEqual({ ok: true });
      expect(prismaMock.accountSnapshot.delete).toHaveBeenCalledWith({
        where: { id: 2 },
      });
    });
  });

  describe("GET /api/snapshot-register/:id", () => {
    let handler: any;

    beforeEach(async () => {
      const mod = await import("../snapshot-register/[id].get");
      handler = mod.default;
    });

    it("returns register snapshot rows", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const created = new Date("2024-01-02T00:00:00.000Z");
      prismaMock.accountRegisterSnapshot.findFirst.mockResolvedValue({
        id: 99,
        accountRegisterId: 5,
        entries: [
          {
            id: 1,
            createdAt: created,
            description: "Coffee",
            seq: 1,
            amount: "5",
            balance: "95",
            typeId: 1,
            categoryId: null,
            isProjected: false,
            isReconciled: false,
            isCleared: true,
            isBalanceEntry: false,
            isPending: false,
            isManualEntry: false,
          },
        ],
      });
      (getUser as any).mockReturnValue({ userId: 1 });

      const out = await handler({
        context: { params: { id: "99" } },
      } as any);

      expect((out as { entries: unknown[] }).entries?.length).toBe(1);
    });
  });
});
