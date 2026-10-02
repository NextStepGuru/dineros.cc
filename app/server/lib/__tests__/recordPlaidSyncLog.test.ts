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
import { recordPlaidSyncLog } from "../recordPlaidSyncLog";

describe("recordPlaidSyncLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults counters to 0 and optional fields to null", async () => {
    (prisma.plaidSyncLog.create as any).mockResolvedValue({ id: 1 });

    await recordPlaidSyncLog({ syncMode: "cron", status: "success" });

    expect(prisma.plaidSyncLog.create).toHaveBeenCalledWith({
      data: {
        syncMode: "cron",
        status: "success",
        itemId: null,
        userId: null,
        durationMs: null,
        txAdded: 0,
        txModified: 0,
        txRemoved: 0,
        newEntries: 0,
        matchedEntries: 0,
        errorCount: 0,
        errorSummary: null,
        metadata: undefined,
      },
    });
  });

  it("persists counters, metadata, and a truncated error summary", async () => {
    (prisma.plaidSyncLog.create as any).mockResolvedValue({ id: 2 });

    await recordPlaidSyncLog({
      syncMode: "webhook",
      status: "partial",
      itemId: "item-9",
      userId: 42,
      durationMs: 1234,
      txAdded: 3,
      txModified: 1,
      txRemoved: 2,
      newEntries: 3,
      matchedEntries: 1,
      errorCount: 1,
      errorSummary: "e".repeat(9000),
      metadata: { trigger: "SYNC_UPDATES_AVAILABLE" },
    });

    const data = (prisma.plaidSyncLog.create as any).mock.calls[0][0].data;
    expect(data.errorSummary).toHaveLength(8000);
    expect(data.metadata).toEqual({ trigger: "SYNC_UPDATES_AVAILABLE" });
    expect(data.txAdded).toBe(3);
    expect(data.userId).toBe(42);
  });

  it("swallows and logs write failures instead of throwing", async () => {
    (prisma.plaidSyncLog.create as any).mockRejectedValue(
      new Error("db write failed"),
    );

    await expect(
      recordPlaidSyncLog({ syncMode: "cron", status: "failed" }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "Failed to record Plaid sync log",
      }),
    );
  });
});
