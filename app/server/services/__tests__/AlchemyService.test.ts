import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";
import env from "~/server/env";
import { syncWalletPortfolio } from "../AlchemyService";

const hoisted = vi.hoisted(() => ({
  nowDate: vi.fn(() => new Date("2024-01-01T00:00:00.000Z")),
}));

// Mock dependencies (every module AlchemyService imports)
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

vi.mock("~/server/logger", () => ({
  log: vi.fn(),
}));

vi.mock("~/server/env", () => ({
  default: { ALCHEMY_API_KEY: "test-alchemy-key" },
}));

vi.mock("~/server/services/forecast", () => ({
  dateTimeService: { nowDate: hoisted.nowDate },
}));

const FETCH_URL =
  "https://api.g.alchemy.com/data/v1/test-alchemy-key/assets/tokens/by-address";
const FIXED_NOW = new Date("2024-01-01T00:00:00.000Z");

function makeRegister(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    walletAddress: "0xwallet",
    type: { registerClass: "crypto" },
    cryptoRegisterChains: [
      { evmChain: { networkId: "eip155:8453" } },
      { evmChain: { networkId: "eip155:1" } },
    ],
    ...overrides,
  };
}

function alchemyToken(overrides: Record<string, unknown> = {}) {
  return {
    network: "base-mainnet",
    tokenAddress: null,
    tokenBalance: "1000000000000000000",
    tokenMetadata: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
      logo: "https://logo/eth.png",
      spam: false,
    },
    tokenPrices: [
      { currency: "usd", value: "3000", lastUpdatedAt: "2024-01-01" },
    ],
    error: null,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("AlchemyService.syncWalletPortfolio", () => {
  let fetchMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restores the key for tests following the "not configured" case
    (env as any).ALCHEMY_API_KEY = "test-alchemy-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Run the transaction callback against the mock prisma proxy so tx.* calls
    // are the same stable vi.fns as prisma.*
    (prisma.$transaction as any).mockImplementation(
      async (callback: (_tx: unknown) => Promise<unknown>) => callback(prisma),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("syncs the portfolio: fetches Alchemy, persists token rows and updates the register balance", async () => {
    const ethToken = alchemyToken();
    const usdcToken = alchemyToken({
      tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tokenBalance: "5000000",
      tokenMetadata: { decimals: 6, name: "USD Coin", symbol: "USDC" },
      tokenPrices: [{ currency: "usd", value: "1" }],
    });
    const noPriceToken = alchemyToken({
      tokenAddress: "0xnope",
      tokenBalance: "2000000000000000000",
      tokenMetadata: { decimals: 18, name: "", symbol: "NOPE" },
      tokenPrices: null,
    });
    const spamToken = alchemyToken({
      tokenAddress: "0xspam",
      tokenMetadata: {
        decimals: 18,
        name: "Spam",
        symbol: "SPAM",
        spam: true,
      },
    });
    const errorToken = alchemyToken({
      tokenAddress: "0xerr",
      error: "token not found",
    });
    // 0.01 units at $0.50 = $0.005 < DUST_USD → dropped
    const dustToken = alchemyToken({
      tokenAddress: "0xdust",
      tokenBalance: "10000000000000000",
      tokenMetadata: { decimals: 18, name: "Dust", symbol: "DUST" },
      tokenPrices: [{ currency: "usd", value: "0.5" }],
    });

    const payload = {
      data: {
        tokens: [
          ethToken,
          usdcToken,
          noPriceToken,
          spamToken,
          errorToken,
          dustToken,
        ],
        pageKey: null,
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(payload));
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister(),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FETCH_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      addresses: [
        { address: "0xwallet", networks: ["eip155:8453", "eip155:1"] },
      ],
      withMetadata: true,
      withPrices: true,
      includeNativeTokens: true,
      includeErc20Tokens: true,
    });

    expect(prisma.accountRegister.findFirst).toHaveBeenCalledWith({
      where: { id: 42 },
      include: {
        type: true,
        cryptoRegisterChains: { include: { evmChain: true } },
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.cryptoTokenBalance.deleteMany).toHaveBeenCalledWith({
      where: { accountRegisterId: 42 },
    });

    // Spam, errored and dust rows are dropped; ETH, USDC and the
    // unpriced token are persisted in raw order
    expect(prisma.cryptoTokenBalance.createMany).toHaveBeenCalledTimes(1);
    const createManyData = (prisma.cryptoTokenBalance.createMany as any).mock
      .calls[0][0].data;
    expect(createManyData).toHaveLength(3);
    expect(createManyData.map((r: any) => r.tokenSymbol)).toEqual([
      "ETH",
      "USDC",
      "NOPE",
    ]);
    expect(createManyData[0]).toMatchObject({
      accountRegisterId: 42,
      network: "base-mainnet",
      tokenAddress: null,
      tokenName: "Ether",
      tokenSymbol: "ETH",
      tokenDecimals: 18,
      tokenBalance: "1000000000000000000",
      displayBalance: 1,
      priceUsd: 3000,
      valueUsd: 3000,
      logoUrl: "https://logo/eth.png",
    });
    expect(createManyData[1]).toMatchObject({
      accountRegisterId: 42,
      tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tokenName: "USD Coin",
      tokenSymbol: "USDC",
      tokenDecimals: 6,
      tokenBalance: "5000000",
      displayBalance: 5,
      priceUsd: 1,
      valueUsd: 5,
      logoUrl: null,
    });
    // No prices and no fallback → null price/value, empty name falls back to symbol
    expect(createManyData[2]).toMatchObject({
      accountRegisterId: 42,
      tokenName: "NOPE",
      tokenSymbol: "NOPE",
      tokenDecimals: 18,
      displayBalance: 2,
      priceUsd: null,
      valueUsd: null,
    });
    for (const row of createManyData) {
      expect(row.syncedAt).toEqual(FIXED_NOW);
    }

    expect(prisma.accountRegister.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        balance: 3005,
        latestBalance: 3005,
        alchemyLastSyncAt: FIXED_NOW,
        alchemyJson: payload,
      },
    });
  });

  it("handles empty balances: clears rows, skips createMany and sets balance to 0", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { tokens: [] } }));
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister(),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({ ok: true });
    expect(prisma.cryptoTokenBalance.deleteMany).toHaveBeenCalledWith({
      where: { accountRegisterId: 42 },
    });
    expect(prisma.cryptoTokenBalance.createMany).not.toHaveBeenCalled();
    expect(prisma.accountRegister.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: expect.objectContaining({ balance: 0, latestBalance: 0 }),
    });
  });

  it("treats a malformed response (missing data/tokens) as an empty portfolio", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister(),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({ ok: true });
    expect(prisma.cryptoTokenBalance.createMany).not.toHaveBeenCalled();
    expect(prisma.accountRegister.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balance: 0, latestBalance: 0 }),
      }),
    );
  });

  it("returns ok:false when the response body is not valid JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 200 }));
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister(),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({ ok: false, message: "Could not reach Alchemy." });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "Alchemy tokens by address network error",
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns ok:false with the status on HTTP failure and logs the error", async () => {
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister(),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({
      ok: false,
      message: "Alchemy request failed (429).",
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "Alchemy tokens by address failed",
        data: expect.objectContaining({ status: 429 }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns ok:false when the request cannot be made (fetch rejects)", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister(),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({ ok: false, message: "Could not reach Alchemy." });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "Alchemy tokens by address network error",
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns ok:false when ALCHEMY_API_KEY is not configured", async () => {
    (env as any).ALCHEMY_API_KEY = undefined;

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({
      ok: false,
      message: "Alchemy is not configured (ALCHEMY_API_KEY).",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.accountRegister.findFirst).not.toHaveBeenCalled();
  });

  it("returns ok:false when the register does not exist", async () => {
    (prisma.accountRegister.findFirst as any).mockResolvedValue(null);

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({ ok: false, message: "Account register not found." });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns ok:false when the register is not a crypto wallet", async () => {
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister({ type: { registerClass: "bank" } }),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({
      ok: false,
      message: "Not a crypto wallet register.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when the wallet address is not set", async () => {
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister({ walletAddress: null }),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({
      ok: false,
      message: "Wallet address is not set.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ok:false when no EVM chains are selected", async () => {
    (prisma.accountRegister.findFirst as any).mockResolvedValue(
      makeRegister({ cryptoRegisterChains: [] }),
    );

    const result = await syncWalletPortfolio(42);

    expect(result).toEqual({
      ok: false,
      message: "No EVM chains selected for this wallet.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
