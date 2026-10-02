import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/clients/prismaClient", () => ({ prisma: {} }));

const recalculate = vi.fn();
vi.mock("~/server/services/forecast", () => ({
  ForecastEngineFactory: {
    create: vi.fn(() => ({ recalculate })),
  },
  dateTimeService: {
    now: vi.fn(() => {
      const chain: any = {
        utc: () => chain,
        subtract: () => chain,
        add: () => chain,
        startOf: () => chain,
        toDate: () => new Date("2024-06-15T08:00:00.000Z"),
      };
      return chain;
    }),
    nowDate: vi.fn(() => new Date("2024-06-15T08:00:00.000Z")),
  },
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import recalculateQueue from "../recalculateQueue";
// eslint-disable-next-line import/first -- mocks must be registered first
import { ForecastEngineFactory } from "~/server/services/forecast";

describe("recalculateQueue processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the forecast engine over a two-year window for the job's account", async () => {
    recalculate.mockResolvedValue({ isSuccess: true });

    await recalculateQueue.processor({
      id: 11,
      data: { accountId: "acct-9" },
    } as never);

    expect(ForecastEngineFactory.create).toHaveBeenCalledWith({});
    expect(recalculate).toHaveBeenCalledWith({
      accountId: "acct-9",
      startDate: new Date("2024-06-15T08:00:00.000Z"),
      endDate: new Date("2024-06-15T08:00:00.000Z"),
      logging: { enabled: false },
    });
  });

  it("throws when the forecast result reports failure", async () => {
    recalculate.mockResolvedValue({
      isSuccess: false,
      errors: ["bad entry e1", "bad entry e2"],
    });

    await expect(
      recalculateQueue.processor({
        id: 12,
        data: { accountId: "acct-9" },
      } as never),
    ).rejects.toThrow("Forecast calculation failed: bad entry e1, bad entry e2");
  });

  it("propagates engine exceptions untouched", async () => {
    recalculate.mockRejectedValue(new Error("engine exploded"));

    await expect(
      recalculateQueue.processor({
        id: 13,
        data: { accountId: "acct-9" },
      } as never),
    ).rejects.toThrow("engine exploded");
  });
});
