import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/lib/recordIntegrationJobLog", () => ({
  recordIntegrationJobLog: vi.fn(),
}));

const getAndSyncPlaidAccounts = vi.fn();
vi.mock("~/server/services/PlaidSyncService", () => ({
  default: class {
    getAndSyncPlaidAccounts = getAndSyncPlaidAccounts;
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import plaidSyncQueue from "../plaidSyncQueue";
// eslint-disable-next-line import/first -- mocks must be registered first
import { recordIntegrationJobLog } from "~/server/lib/recordIntegrationJobLog";
// eslint-disable-next-line import/first -- mocks must be registered first
import { log } from "~/server/logger";

describe("plaidSyncQueue processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes accountRegisterId, resetSyncDates, and itemId to the sync service", async () => {
    getAndSyncPlaidAccounts.mockResolvedValue(undefined);

    await plaidSyncQueue.processor({
      id: 7,
      data: {
        name: "sync",
        accountRegisterId: 42,
        resetSyncDates: true,
        itemId: "item-1",
      },
    } as never);

    expect(getAndSyncPlaidAccounts).toHaveBeenCalledWith({
      accountRegisterId: 42,
      resetSyncDates: true,
      itemId: "item-1",
    });
    expect(recordIntegrationJobLog).not.toHaveBeenCalled();
  });

  it("rethrows service failures after logging and recording an integration job log", async () => {
    getAndSyncPlaidAccounts.mockRejectedValue(new Error("Plaid boom"));

    await expect(
      plaidSyncQueue.processor({
        id: 9,
        data: { name: "sync", accountRegisterId: 42, itemId: "item-2" },
      } as never),
    ).rejects.toThrow("Plaid boom");

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "PLAID_SYNC_JOB_ERROR",
        level: "error",
      }),
    );
    expect(recordIntegrationJobLog).toHaveBeenCalledWith({
      source: "plaid",
      queueName: "plaid-sync",
      jobId: "9",
      message: "Plaid boom",
      itemId: "item-2",
      metadata: { accountRegisterId: 42, resetSyncDates: null },
    });
  });

  it("records a null jobId when the job has no id", async () => {
    getAndSyncPlaidAccounts.mockRejectedValue("string failure");

    await expect(
      plaidSyncQueue.processor({
        data: { name: "sync" },
      } as never),
    ).rejects.toThrow("string failure");

    expect(recordIntegrationJobLog).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: null,
        itemId: null,
        message: "string failure",
      }),
    );
  });
});
