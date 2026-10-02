import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#nuxt/cron", () => ({
  defineCronHandler: vi.fn((_spec: unknown, handler: unknown) => handler),
}));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/clients/queuesClient", () => ({
  addPlaidSyncJob: vi.fn(),
}));
vi.mock("~/server/services/forecast/DateTimeService", () => ({
  dateTimeService: {
    nowDate: vi.fn(() => new Date("2024-06-15T08:30:00.000Z")),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import plaidDaily from "../plaid.daily";
// eslint-disable-next-line import/first -- mocks must be registered first
import { addPlaidSyncJob } from "~/server/clients/queuesClient";

describe("plaid.daily cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues one plaid sync with an idempotent per-day jobId", async () => {
    (addPlaidSyncJob as any).mockResolvedValue(undefined);

    await (plaidDaily as () => Promise<void>)();

    expect(addPlaidSyncJob).toHaveBeenCalledTimes(1);
    expect(addPlaidSyncJob).toHaveBeenCalledWith(
      { name: "Synchronize Plaid accounts from Cron" },
      { delay: 0, jobId: "plaid-daily-2024-06-15" },
    );
  });
});
