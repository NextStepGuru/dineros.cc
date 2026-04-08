import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error: { statusCode?: number; statusMessage?: string }) => {
    const err = new Error(
      error.statusMessage || "Unknown error",
    ) as Error & { statusCode?: number };
    err.statusCode = error.statusCode ?? 500;
    throw err;
  }),
  getRouterParam: vi.fn(),
  readBody: vi.fn(),
}));

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

const mockUser = { userId: 42 };

const cashRegisterRow = {
  id: 7,
  name: "Cash",
  accountId: "acc-1",
  type: { type: "cash" as const },
};

const checkingRegisterRow = {
  id: 8,
  name: "Checking",
  accountId: "acc-1",
  type: { type: "checking" as const },
};

describe("Cash on hand API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/cash-on-hand/[registerId]", () => {
    let getHandler: (_event: unknown) => Promise<unknown>;

    beforeEach(async () => {
      const mod = await import("../cash-on-hand/[registerId].get");
      getHandler = mod.default;
      const { getUser } = await import("~/server/lib/getUser");
      (getUser as any).mockReturnValue(mockUser);
    });

    it("returns 400 when register id is not a positive integer", async () => {
      const { getRouterParam } = await import("h3");
      (getRouterParam as any).mockReturnValue("not-a-number");

      await expect(getHandler({})).rejects.toThrow();
    });

    it("returns 404 when register is not found", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("99");
      (prisma.accountRegister.findFirst as any).mockResolvedValue(null);

      await expect(getHandler({})).rejects.toThrow(
        "Account register not found",
      );
    });

    it("returns 403 when register is not a cash type", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("8");
      (prisma.accountRegister.findFirst as any).mockResolvedValue(
        checkingRegisterRow,
      );

      await expect(getHandler({})).rejects.toThrow(
        "Cash count is only available for Cash account registers.",
      );
    });

    it("returns denominations when cash register has a row", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("7");
      (prisma.accountRegister.findFirst as any).mockResolvedValue(
        cashRegisterRow,
      );
      (prisma.cashOnHand.findUnique as any).mockResolvedValue({
        ones: 2,
        fives: 0,
        tens: 1,
        twenties: 0,
        fifties: 0,
        hundreds: 0,
      });

      const result = await getHandler({});

      expect(prisma.accountRegister.findFirst).toHaveBeenCalled();
      expect(prisma.cashOnHand.findUnique).toHaveBeenCalledWith({
        where: { accountRegisterId: 7 },
      });
      expect(prisma.cashOnHand.create).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        registerId: 7,
        registerName: "Cash",
        accountId: "acc-1",
        ones: 2,
        tens: 1,
      });
    });

    it("creates a cash_on_hand row when missing", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("7");
      (prisma.accountRegister.findFirst as any).mockResolvedValue(
        cashRegisterRow,
      );
      (prisma.cashOnHand.findUnique as any).mockResolvedValue(null);
      (prisma.cashOnHand.create as any).mockResolvedValue({
        ones: 0,
        fives: 0,
        tens: 0,
        twenties: 0,
        fifties: 0,
        hundreds: 0,
      });

      const result = await getHandler({});

      expect(prisma.cashOnHand.create).toHaveBeenCalledWith({
        data: { accountRegisterId: 7 },
      });
      expect(result).toMatchObject({ registerId: 7, ones: 0 });
    });
  });

  describe("PATCH /api/cash-on-hand/[registerId]", () => {
    let patchHandler: (_event: unknown) => Promise<unknown>;

    beforeEach(async () => {
      const mod = await import("../cash-on-hand/[registerId].patch");
      patchHandler = mod.default;
      const { getUser } = await import("~/server/lib/getUser");
      (getUser as any).mockReturnValue(mockUser);
    });

    it("returns 403 when register is not cash", async () => {
      const { getRouterParam } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      (getRouterParam as any).mockReturnValue("8");
      (prisma.accountRegister.findFirst as any).mockResolvedValue(
        checkingRegisterRow,
      );

      await expect(patchHandler({})).rejects.toThrow(
        "Cash count is only available for Cash account registers.",
      );
      expect(prisma.cashOnHand.upsert).not.toHaveBeenCalled();
    });

    it("upserts cash counts for a cash register", async () => {
      const { getRouterParam, readBody } = await import("h3");
      const { prisma } = await import("~/server/clients/prismaClient");

      const body = {
        ones: 1,
        fives: 2,
        tens: 0,
        twenties: 0,
        fifties: 0,
        hundreds: 1,
      };

      (getRouterParam as any).mockReturnValue("7");
      (prisma.accountRegister.findFirst as any).mockResolvedValue({
        id: 7,
        type: { type: "cash" },
      });
      (readBody as any).mockResolvedValue(body);
      (prisma.cashOnHand.upsert as any).mockResolvedValue({});

      const result = await patchHandler({});

      expect(prisma.cashOnHand.upsert).toHaveBeenCalledWith({
        where: { accountRegisterId: 7 },
        create: {
          accountRegisterId: 7,
          ...body,
        },
        update: body,
      });
      expect(result).toEqual({ ok: true });
    });
  });
});
