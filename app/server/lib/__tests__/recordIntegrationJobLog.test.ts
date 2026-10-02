import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});

// eslint-disable-next-line import/first -- mocks must be registered first
import { prisma } from "~/server/clients/prismaClient";
// eslint-disable-next-line import/first -- mocks must be registered first
import { log } from "~/server/logger";
// eslint-disable-next-line import/first -- mocks must be registered first
import { recordIntegrationJobLog } from "../recordIntegrationJobLog";

describe("recordIntegrationJobLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a job log row with null coalescing for optional fields", async () => {
    (prisma.integrationJobLog.create as any).mockResolvedValue({ id: 1 });

    await recordIntegrationJobLog({
      source: "plaid",
      queueName: "plaid-sync",
      message: "sync failed",
    });

    expect(prisma.integrationJobLog.create).toHaveBeenCalledWith({
      data: {
        source: "plaid",
        queueName: "plaid-sync",
        jobId: null,
        message: "sync failed",
        itemId: null,
        metadata: undefined,
      },
    });
  });

  it("truncates oversized messages to 8000 characters", async () => {
    (prisma.integrationJobLog.create as any).mockResolvedValue({ id: 1 });

    await recordIntegrationJobLog({
      source: "openai",
      queueName: "recategorize",
      jobId: "7",
      message: "x".repeat(9000),
      itemId: "item-1",
      metadata: { accountId: "acct-1" },
    });

    const data = (prisma.integrationJobLog.create as any).mock.calls[0][0].data;
    expect(data.message).toHaveLength(8000);
    expect(data.jobId).toBe("7");
    expect(data.itemId).toBe("item-1");
    expect(data.metadata).toEqual({ accountId: "acct-1" });
  });

  it("swallows and logs write failures instead of throwing", async () => {
    (prisma.integrationJobLog.create as any).mockRejectedValue(
      new Error("db write failed"),
    );

    await expect(
      recordIntegrationJobLog({
        source: "plaid",
        queueName: "plaid-sync",
        message: "boom",
      }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "Failed to record integration job log",
      }),
    );
  });
});
