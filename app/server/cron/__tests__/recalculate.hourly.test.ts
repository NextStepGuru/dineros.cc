import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#nuxt/cron", () => ({
  defineCronHandler: vi.fn((_spec: unknown, handler: unknown) => handler),
}));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});
vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import recalculate from "../recalculate.hourly";
// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import { addRecalculateJob } from "~/server/clients/queuesClient";

describe("recalculate.hourly cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues one recalculate job per account with pending recalculations", async () => {
    (prisma.account.findMany as any).mockResolvedValue([{ id: "a1" }, { id: "a2" }]);

    await (recalculate as () => Promise<void>)();

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isArchived: false,
          registers: {
            some: {
              isArchived: false,
              entries: { some: { hasBalanceReCalc: true } },
            },
          },
        }),
        select: { id: true },
      }),
    );
    expect(addRecalculateJob).toHaveBeenCalledTimes(2);
    expect(addRecalculateJob).toHaveBeenNthCalledWith(1, { accountId: "a1" });
    expect(addRecalculateJob).toHaveBeenNthCalledWith(2, { accountId: "a2" });
  });

  it("enqueues nothing when no accounts need recalculation", async () => {
    (prisma.account.findMany as any).mockResolvedValue([]);

    await (recalculate as () => Promise<void>)();

    expect(addRecalculateJob).not.toHaveBeenCalled();
  });
});
