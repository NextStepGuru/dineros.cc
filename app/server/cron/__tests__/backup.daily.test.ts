import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#nuxt/cron", () => ({
  defineCronHandler: vi.fn((_spec: unknown, handler: unknown) => handler),
}));
vi.mock("~/server/clients/queuesClient", () => ({
  addBackupJob: vi.fn(),
}));

// eslint-disable-next-line import/first -- mocks must be registered first
import dailyBackup from "../backup.daily";
// eslint-disable-next-line import/first -- mocks must be registered first
import { addBackupJob } from "~/server/clients/queuesClient";

describe("backup.daily cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues a daily backup job", async () => {
    await (dailyBackup as () => Promise<void>)();

    expect(addBackupJob).toHaveBeenCalledTimes(1);
    expect(addBackupJob).toHaveBeenCalledWith({ name: "Daily backup" });
  });
});
