import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#nuxt/cron", () => ({
  defineCronHandler: vi.fn((_spec: unknown, handler: unknown) => handler),
}));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/clients/queuesClient", () => ({
  addPlaidBalanceSyncJob: vi.fn(),
}));
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

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
import plaidBalance from "../plaid-balance.hourly";
// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import { addPlaidBalanceSyncJob } from "~/server/clients/queuesClient";

describe("plaid-balance.hourly cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues one balance sync per plaid token, deduplicating registers that share a token", async () => {
    (prisma.accountRegister.findMany as any).mockResolvedValue([
      { id: 1, plaidAccessToken: "token-a" },
      { id: 2, plaidAccessToken: "token-b" },
      { id: 3, plaidAccessToken: "token-a" },
    ]);

    await (plaidBalance as () => Promise<void>)();

    expect(prisma.accountRegister.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isArchived: false,
          plaidAccessToken: { not: null },
          plaidId: { not: null },
          OR: [
            { plaidBalanceLastSyncAt: null },
            { plaidBalanceLastSyncAt: { lt: fixedOlderThan } },
          ],
        }),
        select: { id: true, plaidAccessToken: true },
      }),
    );
    expect(addPlaidBalanceSyncJob).toHaveBeenCalledTimes(2);
    // The first register seen per token wins.
    expect(addPlaidBalanceSyncJob).toHaveBeenNthCalledWith(1, {
      accountRegisterId: 1,
    });
    expect(addPlaidBalanceSyncJob).toHaveBeenNthCalledWith(2, {
      accountRegisterId: 2,
    });
  });

  it("skips registers with a null token", async () => {
    (prisma.accountRegister.findMany as any).mockResolvedValue([
      { id: 1, plaidAccessToken: null },
      { id: 2, plaidAccessToken: "token-a" },
    ]);

    await (plaidBalance as () => Promise<void>)();

    expect(addPlaidBalanceSyncJob).toHaveBeenCalledTimes(1);
    expect(addPlaidBalanceSyncJob).toHaveBeenCalledWith({
      accountRegisterId: 2,
    });
  });

  it("enqueues nothing when no registers are stale", async () => {
    (prisma.accountRegister.findMany as any).mockResolvedValue([]);

    await (plaidBalance as () => Promise<void>)();

    expect(addPlaidBalanceSyncJob).not.toHaveBeenCalled();
  });
});
