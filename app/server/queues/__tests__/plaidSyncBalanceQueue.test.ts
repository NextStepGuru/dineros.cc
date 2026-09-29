import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~/server/clients/prismaClient";
import { addPlaidSyncJob } from "~/server/clients/queuesClient";
import PlaidSyncService from "~/server/services/PlaidSyncService";
import plaidBalanceSync from "../plaidSyncBalanceQueue";

vi.mock("~/server/clients/prismaClient", async () => {
  const { createMockPrisma } = await import("~/tests/helpers/prismaMock");
  return { prisma: createMockPrisma() };
});
vi.mock("~/server/clients/queuesClient");
vi.mock("~/server/logger");
vi.mock("~/server/services/PlaidSyncService");

const runJob = (data: { accountRegisterId: number }) =>
  plaidBalanceSync.processor({ id: "test-job", data } as never);

describe("plaidSyncBalanceQueue processor", () => {
  let getBalances: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getBalances = vi.fn();
    (PlaidSyncService as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      function () {
        return { getAllAccountsByAccessTokenAndUpdateBalance: getBalances };
      },
    );
    vi.mocked(prisma.accountRegister.findFirst).mockResolvedValue({
      plaidAccessToken: "test-token",
    } as never);
    vi.mocked(prisma.accountRegister.findMany).mockResolvedValue([
      { plaidId: "plaid-acc-1" },
    ] as never);
  });

  it("chases a delay-0 transaction sync for each register whose balance moved", async () => {
    getBalances.mockResolvedValue({
      accounts: [],
      changedRegisterIds: [42, 43],
    });

    await runJob({ accountRegisterId: 1 });

    expect(addPlaidSyncJob).toHaveBeenCalledTimes(2);
    expect(addPlaidSyncJob).toHaveBeenNthCalledWith(
      1,
      { name: "Plaid balance chase", accountRegisterId: 42 },
      { delay: 0 },
    );
    expect(addPlaidSyncJob).toHaveBeenNthCalledWith(
      2,
      { name: "Plaid balance chase", accountRegisterId: 43 },
      { delay: 0 },
    );
  });

  it("does not chase when no balance changed", async () => {
    getBalances.mockResolvedValue({ accounts: [], changedRegisterIds: [] });

    await runJob({ accountRegisterId: 1 });

    expect(addPlaidSyncJob).not.toHaveBeenCalled();
  });
});
