import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#nuxt/cron", () => ({
  defineCronHandler: vi.fn((_spec: unknown, handler: unknown) => handler),
}));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});
vi.mock("~/server/services/AlchemyService", () => ({
  syncWalletPortfolio: vi.fn(),
}));

const fixedOlderThan = new Date("2024-06-15T02:00:00.000Z");
vi.mock("~/server/services/forecast", () => ({
  dateTimeService: {
    now: vi.fn(() => {
      const chain: any = {
        utc: () => chain,
        subtract: () => chain,
        toDate: () => fixedOlderThan,
      };
      return chain;
    }),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import cryptoBalance from "../crypto-balance.hourly";
// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import { syncWalletPortfolio } from "~/server/services/AlchemyService";
// eslint-disable-next-line import/first -- mocks must be registered first
import { log } from "~/server/logger";

describe("crypto-balance.hourly cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs up to 50 stale crypto registers and reports the cutoff in the query", async () => {
    (prisma.accountRegister.findMany as any).mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ]);
    (syncWalletPortfolio as any).mockResolvedValue({ ok: true });

    await (cryptoBalance as () => Promise<void>)();

    expect(prisma.accountRegister.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isArchived: false,
          walletAddress: { not: null },
          type: { registerClass: "crypto" },
          OR: [
            { alchemyLastSyncAt: null },
            { alchemyLastSyncAt: { lt: fixedOlderThan } },
          ],
        }),
        select: { id: true },
        take: 50,
      }),
    );
    expect(syncWalletPortfolio).toHaveBeenCalledTimes(2);
    expect(syncWalletPortfolio).toHaveBeenCalledWith(1);
    expect(syncWalletPortfolio).toHaveBeenCalledWith(2);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs a warning for each register whose sync fails", async () => {
    (prisma.accountRegister.findMany as any).mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ]);
    (syncWalletPortfolio as any)
      .mockResolvedValueOnce({ ok: false, message: "Alchemy down" })
      .mockResolvedValueOnce({ ok: true });

    await (cryptoBalance as () => Promise<void>)();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Crypto balance cron sync failed",
        level: "warn",
        data: {
          accountRegisterId: 1,
          result: { ok: false, message: "Alchemy down" },
        },
      }),
    );
  });

  it("does nothing when no registers are stale", async () => {
    (prisma.accountRegister.findMany as any).mockResolvedValue([]);

    await (cryptoBalance as () => Promise<void>)();

    expect(syncWalletPortfolio).not.toHaveBeenCalled();
  });
});
