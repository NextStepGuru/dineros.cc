import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to ensure the mock is set up before any imports
vi.hoisted(() => {
  // Make defineEventHandler available globally before any imports
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
  setResponseStatus: vi.fn(),
  getRouterParam: vi.fn(),
}));

// Make H3 functions globally available (endpoints rely on Nuxt auto-imports)
(globalThis as any).readBody = vi.fn();
(globalThis as any).getQuery = vi.fn();
(globalThis as any).getRouterParam = vi.fn();

// Mock server dependencies
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

vi.mock("~/server/services/AlchemyService", () => ({
  syncWalletPortfolio: vi.fn(),
}));

async function rejectionOf(promise: Promise<unknown>): Promise<any> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the handler to reject, but it resolved.");
}

describe("Crypto API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-create the global auto-import mocks after clearAllMocks
    (globalThis as any).readBody = vi.fn();
    (globalThis as any).getQuery = vi.fn();
    (globalThis as any).getRouterParam = vi.fn();
  });

  describe("GET /api/crypto-register-chains/[id]", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../crypto-register-chains/[id].get");
      handler = module.default;
    });

    it("returns the EVM chain ids for an owned register", async () => {
      const mockEvent = {};
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getRouterParam.mockReturnValue("5");
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirstOrThrow as any).mockResolvedValue({
        id: 5,
      });
      (prisma.cryptoRegisterChain.findMany as any).mockResolvedValue([
        { evmChainId: 1 },
        { evmChainId: 8453 },
      ]);

      const result = await handler(mockEvent);

      expect(result).toEqual({ evmChainIds: [1, 8453] });
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(
        (globalThis as any).getRouterParam,
      ).toHaveBeenCalledWith(mockEvent, "id");
      expect(prisma.accountRegister.findFirstOrThrow).toHaveBeenCalledWith({
        where: {
          id: 5,
          account: { userAccounts: { some: { userId: 123 } } },
        },
      });
      expect(prisma.cryptoRegisterChain.findMany).toHaveBeenCalledWith({
        where: { accountRegisterId: 5 },
        select: { evmChainId: true },
      });
    });

    it("rejects with 400 for an invalid register id", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getRouterParam.mockReturnValue("abc");
      (getUser as any).mockReturnValue({ userId: 123 });

      const error = await rejectionOf(handler({}));

      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain("Invalid register id.");
      expect(prisma.accountRegister.findFirstOrThrow).not.toHaveBeenCalled();

      (globalThis as any).getRouterParam.mockReturnValue("0");
      const zeroError = await rejectionOf(handler({}));
      expect(zeroError.statusCode).toBe(400);
    });

    it("propagates register lookup failure and reports it to handleApiError", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { handleApiError } = await import("~/server/lib/handleApiError");

      const lookupError = new Error("Register not found");
      (globalThis as any).getRouterParam.mockReturnValue("5");
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirstOrThrow as any).mockRejectedValue(
        lookupError,
      );

      const error = await rejectionOf(handler({}));

      expect(error).toBe(lookupError);
      expect(handleApiError).toHaveBeenCalledWith(lookupError);
    });
  });

  describe("GET /api/crypto-tokens/[id]", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../crypto-tokens/[id].get");
      handler = module.default;
    });

    it("returns sorted token balances with total usd for an owned crypto register", async () => {
      const mockEvent = {};
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const lastSyncAt = new Date("2024-01-02T03:04:05.000Z");
      const syncedAt = new Date("2024-01-01T00:00:00.000Z");

      (globalThis as any).getRouterParam.mockReturnValue("9");
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirst as any).mockResolvedValue({
        id: 9,
        alchemyLastSyncAt: lastSyncAt,
        latestBalance: "3005",
        type: { registerClass: "crypto" },
      });
      (prisma.cryptoTokenBalance.findMany as any).mockResolvedValue([
        {
          id: 1,
          accountRegisterId: 9,
          network: "base-mainnet",
          tokenAddress: "0xusdc",
          tokenName: "USD Coin",
          tokenSymbol: "USDC",
          tokenDecimals: 6,
          displayBalance: "5",
          priceUsd: "1",
          valueUsd: "5",
          logoUrl: null,
          syncedAt,
        },
        {
          id: 2,
          accountRegisterId: 9,
          network: "base-mainnet",
          tokenAddress: null,
          tokenName: "Ether",
          tokenSymbol: "ETH",
          tokenDecimals: 18,
          displayBalance: "1",
          priceUsd: "3000",
          valueUsd: "3000",
          logoUrl: "https://logo/eth.png",
          syncedAt,
        },
        {
          id: 3,
          accountRegisterId: 9,
          network: "base-mainnet",
          tokenAddress: "0xnope",
          tokenName: "Nope",
          tokenSymbol: "NOPE",
          tokenDecimals: 18,
          displayBalance: "2",
          priceUsd: null,
          valueUsd: null,
          logoUrl: null,
          syncedAt,
        },
      ]);

      const result = await handler(mockEvent);

      expect(prisma.accountRegister.findFirst).toHaveBeenCalledWith({
        where: {
          id: 9,
          account: { userAccounts: { some: { userId: 123 } } },
        },
        include: { type: true },
      });
      expect(prisma.cryptoTokenBalance.findMany).toHaveBeenCalledWith({
        where: { accountRegisterId: 9 },
      });

      expect(result.accountRegisterId).toBe(9);
      expect(result.alchemyLastSyncAt).toBe(lastSyncAt);
      expect(result.totalUsd).toBe(3005);
      // Sorted by valueUsd descending, null values last
      expect(result.tokens.map((t: any) => t.id)).toEqual([2, 1, 3]);
      expect(result.tokens[0]).toEqual({
        id: 2,
        accountRegisterId: 9,
        network: "base-mainnet",
        tokenAddress: null,
        tokenName: "Ether",
        tokenSymbol: "ETH",
        tokenDecimals: 18,
        displayBalance: 1,
        priceUsd: 3000,
        valueUsd: 3000,
        logoUrl: "https://logo/eth.png",
        syncedAt: "2024-01-01T00:00:00.000Z",
      });
      expect(result.tokens[2].valueUsd).toBeNull();
      expect(result.tokens[2].priceUsd).toBeNull();
      expect(result.tokens[2].syncedAt).toBe("2024-01-01T00:00:00.000Z");
    });

    it("rejects with 404 when the register does not exist for this user", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getRouterParam.mockReturnValue("9");
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirst as any).mockResolvedValue(null);

      const error = await rejectionOf(handler({}));

      expect(error.statusCode).toBe(404);
      expect(error.message).toContain("Register not found.");
      expect(prisma.cryptoTokenBalance.findMany).not.toHaveBeenCalled();
    });

    it("rejects with 400 when the register is not a crypto wallet", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getRouterParam.mockReturnValue("9");
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirst as any).mockResolvedValue({
        id: 9,
        type: { registerClass: "bank" },
      });

      const error = await rejectionOf(handler({}));

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain("Not a crypto wallet register.");
      expect(prisma.cryptoTokenBalance.findMany).not.toHaveBeenCalled();
    });

    it("rejects with 400 for an invalid register id", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");

      (globalThis as any).getRouterParam.mockReturnValue("not-a-number");
      (getUser as any).mockReturnValue({ userId: 123 });

      const error = await rejectionOf(handler({}));

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain("Invalid register id.");
      expect(prisma.accountRegister.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/crypto-sync", () => {
    let handler: any;

    beforeEach(async () => {
      const module = await import("../crypto-sync.post");
      handler = module.default;
    });

    it("syncs the wallet portfolio and returns the updated register", async () => {
      const mockEvent = {};
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { syncWalletPortfolio } = await import(
        "~/server/services/AlchemyService"
      );
      const updatedRegister = {
        id: 7,
        balance: 3005,
        latestBalance: 3005,
      };

      (globalThis as any).readBody.mockResolvedValue({
        accountRegisterId: 7,
      });
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirst as any).mockResolvedValue({
        id: 7,
        type: { registerClass: "crypto" },
      });
      (syncWalletPortfolio as any).mockResolvedValue({ ok: true });
      (prisma.accountRegister.findUnique as any).mockResolvedValue(
        updatedRegister,
      );

      const result = await handler(mockEvent);

      expect(result).toEqual({ ok: true, accountRegister: updatedRegister });
      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect((globalThis as any).readBody).toHaveBeenCalledWith(mockEvent);
      expect(prisma.accountRegister.findFirst).toHaveBeenCalledWith({
        where: {
          id: 7,
          account: { userAccounts: { some: { userId: 123 } } },
        },
        include: { type: true },
      });
      expect(syncWalletPortfolio).toHaveBeenCalledWith(7);
      expect(prisma.accountRegister.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
      });
    });

    it("rejects invalid request bodies through handleApiError", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { syncWalletPortfolio } = await import(
        "~/server/services/AlchemyService"
      );
      const { handleApiError } = await import("~/server/lib/handleApiError");

      (globalThis as any).readBody.mockResolvedValue({
        accountRegisterId: -5,
      });
      (getUser as any).mockReturnValue({ userId: 123 });

      const error = await rejectionOf(handler({}));

      expect(error).toBeDefined();
      expect(handleApiError).toHaveBeenCalledTimes(1);
      expect(prisma.accountRegister.findFirst).not.toHaveBeenCalled();
      expect(syncWalletPortfolio).not.toHaveBeenCalled();

      // Missing field is invalid too
      (globalThis as any).readBody.mockResolvedValue({});
      const missingFieldError = await rejectionOf(handler({}));
      expect(missingFieldError).toBeDefined();
      expect(handleApiError).toHaveBeenCalledTimes(2);
    });

    it("rejects with 404 and does not sync when the register is not found", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { syncWalletPortfolio } = await import(
        "~/server/services/AlchemyService"
      );

      (globalThis as any).readBody.mockResolvedValue({
        accountRegisterId: 7,
      });
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirst as any).mockResolvedValue(null);

      const error = await rejectionOf(handler({}));

      expect(error.statusCode).toBe(404);
      expect(error.message).toContain("Register not found.");
      expect(syncWalletPortfolio).not.toHaveBeenCalled();
      expect(prisma.accountRegister.findUnique).not.toHaveBeenCalled();
    });

    it("rejects with 400 when the register is not a crypto wallet", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { syncWalletPortfolio } = await import(
        "~/server/services/AlchemyService"
      );

      (globalThis as any).readBody.mockResolvedValue({
        accountRegisterId: 7,
      });
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirst as any).mockResolvedValue({
        id: 7,
        type: { registerClass: "loan" },
      });

      const error = await rejectionOf(handler({}));

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain("Not a crypto wallet register.");
      expect(syncWalletPortfolio).not.toHaveBeenCalled();
    });

    it("maps a failed wallet sync to a 502 with the service message", async () => {
      const { getUser } = await import("~/server/lib/getUser");
      const { prisma } = await import("~/server/clients/prismaClient");
      const { syncWalletPortfolio } = await import(
        "~/server/services/AlchemyService"
      );

      (globalThis as any).readBody.mockResolvedValue({
        accountRegisterId: 7,
      });
      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.accountRegister.findFirst as any).mockResolvedValue({
        id: 7,
        type: { registerClass: "crypto" },
      });
      (syncWalletPortfolio as any).mockResolvedValue({
        ok: false,
        message: "Alchemy request failed (500).",
      });

      const error = await rejectionOf(handler({}));

      expect(error.statusCode).toBe(502);
      expect(error.message).toContain("Alchemy request failed (500).");
      expect(prisma.accountRegister.findUnique).not.toHaveBeenCalled();
    });
  });
});
