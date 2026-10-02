import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#nuxt/cron", () => ({
  defineCronHandler: vi.fn((_spec: unknown, handler: unknown) => handler),
}));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("~/server/services/billCenterService", () => ({
  evaluateBillRemindersForAllBudgets: vi.fn(),
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import billReminders from "../bill-reminders.hourly";
// eslint-disable-next-line import/first -- mocks must be registered first
import { log } from "~/server/logger";
// eslint-disable-next-line import/first -- mocks must be registered first
import { evaluateBillRemindersForAllBudgets } from "~/server/services/billCenterService";

describe("bill-reminders.hourly cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs at info level when evaluation succeeds without failures", async () => {
    (evaluateBillRemindersForAllBudgets as any).mockResolvedValue({
      failures: [],
      sent: 2,
    });

    await (billReminders as () => Promise<void>)();

    expect(evaluateBillRemindersForAllBudgets).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Bill reminder evaluation completed",
        level: "info",
        data: { failures: [], sent: 2 },
      }),
    );
  });

  it("logs at warn level when some budgets failed evaluation", async () => {
    (evaluateBillRemindersForAllBudgets as any).mockResolvedValue({
      failures: [{ budgetId: 3, error: "boom" }],
    });

    await (billReminders as () => Promise<void>)();

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        data: { failures: [{ budgetId: 3, error: "boom" }] },
      }),
    );
  });

  it("propagates evaluation errors so the cron runner sees the failure", async () => {
    (evaluateBillRemindersForAllBudgets as any).mockRejectedValue(
      new Error("db down"),
    );

    await expect(
      (billReminders as () => Promise<void>)(),
    ).rejects.toThrow("db down");
    expect(log).not.toHaveBeenCalled();
  });
});
