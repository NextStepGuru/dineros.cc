import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("~/server/clients/prismaClient", () => ({ prisma: {} }));
vi.mock("~/server/env", () => ({
  default: { DEPLOY_ENV: "staging" },
}));
vi.mock("~/server/logger", () => ({ log: vi.fn() }));
vi.mock("@google-cloud/storage", () => ({ Storage: vi.fn() }));

// eslint-disable-next-line import/first -- mocks must be registered first
import { Storage } from "@google-cloud/storage";
// eslint-disable-next-line import/first -- mocks must be registered first
import backup from "../backupQueue";

describe("backupQueue processor", () => {
  const originalBucket = process.env.BACKUP_BUCKET_NAME;

  afterEach(() => {
    if (originalBucket === undefined) {
      delete process.env.BACKUP_BUCKET_NAME;
    } else {
      process.env.BACKUP_BUCKET_NAME = originalBucket;
    }
    vi.clearAllMocks();
  });

  it("fails fast when BACKUP_BUCKET_NAME is unset outside local", async () => {
    delete process.env.BACKUP_BUCKET_NAME;

    await expect(
      backup.processor({ id: "test-job", data: { name: "Daily backup" } } as never)
    ).rejects.toThrow(/BACKUP_BUCKET_NAME/);

    // Must refuse before touching storage or dumping any data
    expect(Storage).not.toHaveBeenCalled();
  });
});
