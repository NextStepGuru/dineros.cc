import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/lib/recordIntegrationJobLog", () => ({
  recordIntegrationJobLog: vi.fn(),
}));

const recategorizeUnlockedPlaidEntries = vi.fn();
vi.mock("~/server/services/TransactionCategorizationService", () => ({
  default: class {
    recategorizeUnlockedPlaidEntries = recategorizeUnlockedPlaidEntries;
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import recategorizeQueue from "../recategorizeQueue";
// eslint-disable-next-line import/first -- mocks must be registered first
import { recordIntegrationJobLog } from "~/server/lib/recordIntegrationJobLog";

describe("recategorizeQueue processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes accountId, accountRegisterId, and userId to the categorization service", async () => {
    recategorizeUnlockedPlaidEntries.mockResolvedValue({ updated: 3 });

    await recategorizeQueue.processor({
      id: 3,
      data: { accountId: "acct-1", accountRegisterId: 5, userId: 12 },
    } as never);

    expect(recategorizeUnlockedPlaidEntries).toHaveBeenCalledWith({
      accountId: "acct-1",
      accountRegisterId: 5,
      userId: 12,
    });
    expect(recordIntegrationJobLog).not.toHaveBeenCalled();
  });

  it("logs and records an integration job log before rethrowing failures", async () => {
    recategorizeUnlockedPlaidEntries.mockRejectedValue(
      new Error("OpenAI quota exceeded"),
    );

    await expect(
      recategorizeQueue.processor({
        id: 4,
        data: { accountId: "acct-1", userId: null },
      } as never),
    ).rejects.toThrow("OpenAI quota exceeded");

    expect(recordIntegrationJobLog).toHaveBeenCalledWith({
      source: "openai",
      queueName: "register-entry-recategorize",
      jobId: "4",
      message: "OpenAI quota exceeded",
      metadata: { accountId: "acct-1", accountRegisterId: null },
    });
  });

  it("stringifies non-Error failures and records a null jobId when absent", async () => {
    recategorizeUnlockedPlaidEntries.mockRejectedValue({ boom: true });

    await expect(
      recategorizeQueue.processor({
        data: { accountId: "acct-2", userId: 1 },
      } as never),
    ).rejects.toThrow();

    expect(recordIntegrationJobLog).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: null,
        message: "[object Object]",
      }),
    );
  });
});
