import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler: unknown) => handler);
});

vi.mock("h3", () => ({
  defineEventHandler: vi.fn((handler: unknown) => handler),
  getQuery: vi.fn(),
}));

(globalThis as any).getQuery = vi.fn();

vi.mock("~/server/clients/queuesClient", () => ({
  addRecalculateJob: vi.fn(),
}));

vi.mock("~/server/lib/getUser", () => ({
  getUser: vi.fn(() => ({ userId: 123 })),
}));

vi.mock("~/server/lib/handleApiError", () => ({
  handleApiError: vi.fn(),
}));

vi.mock("~/schema/zod", () => ({
  accountRegisterSchema: {
    parse: (x: unknown) => x,
  },
}));

const prismaMock = vi.hoisted(() => {
  const accountRegisterIdInner = 7;
  const accountIdInner = "account-xyz";
  const mockArchivedRow = {
    id: accountRegisterIdInner,
    accountId: accountIdInner,
    name: "Reg",
    isArchived: true,
  };
  const resolved = { count: 0 };
  const savingsGoalUpdateMany = vi.fn().mockResolvedValue(resolved);
  const accountRegisterUpdateMany = vi.fn().mockResolvedValue(resolved);
  const accountRegisterUpdate = vi.fn().mockResolvedValue(mockArchivedRow);
  const accountRegisterDelete = vi.fn();
  const reoccurrenceUpdateMany = vi.fn().mockResolvedValue(resolved);
  const reoccurrenceDeleteMany = vi.fn().mockResolvedValue(resolved);
  const reoccurrenceSplitDeleteMany = vi.fn().mockResolvedValue(resolved);
  const registerEntryDeleteMany = vi.fn().mockResolvedValue(resolved);
  const reoccurrenceSkipDeleteMany = vi.fn().mockResolvedValue(resolved);
  const reoccurrencePlaidNameAliasDeleteMany = vi
    .fn()
    .mockResolvedValue(resolved);

  return {
    savingsGoalUpdateMany,
    accountRegisterUpdateMany,
    accountRegisterUpdate,
    accountRegisterDelete,
    reoccurrenceUpdateMany,
    reoccurrenceDeleteMany,
    reoccurrenceSplitDeleteMany,
    registerEntryDeleteMany,
    reoccurrenceSkipDeleteMany,
    reoccurrencePlaidNameAliasDeleteMany,
    accountRegisterFindFirstOrThrow: vi.fn().mockResolvedValue({
      id: accountRegisterIdInner,
      accountId: accountIdInner,
      name: "Reg",
    }),
    $transaction: vi.fn(),
  };
});

vi.mock("~/server/clients/prismaClient", () => ({
  prisma: {
    accountRegister: {
      findFirstOrThrow: prismaMock.accountRegisterFindFirstOrThrow,
      updateMany: prismaMock.accountRegisterUpdateMany,
      update: prismaMock.accountRegisterUpdate,
      delete: prismaMock.accountRegisterDelete,
    },
    savingsGoal: {
      updateMany: prismaMock.savingsGoalUpdateMany,
    },
    reoccurrence: {
      updateMany: prismaMock.reoccurrenceUpdateMany,
      deleteMany: prismaMock.reoccurrenceDeleteMany,
    },
    reoccurrenceSplit: {
      deleteMany: prismaMock.reoccurrenceSplitDeleteMany,
    },
    registerEntry: {
      deleteMany: prismaMock.registerEntryDeleteMany,
    },
    reoccurrenceSkip: {
      deleteMany: prismaMock.reoccurrenceSkipDeleteMany,
    },
    reoccurrencePlaidNameAlias: {
      deleteMany: prismaMock.reoccurrencePlaidNameAliasDeleteMany,
    },
    $transaction: prismaMock.$transaction,
  },
}));

const accountRegisterId = 7;
const accountId = "account-xyz";
const userId = 123;

describe("account register archive regression (DELETE → soft archive)", () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.accountRegisterFindFirstOrThrow.mockResolvedValue({
      id: accountRegisterId,
      accountId,
      name: "Reg",
    });
    prismaMock.accountRegisterUpdate.mockResolvedValue({
      id: accountRegisterId,
      accountId,
      name: "Reg",
      isArchived: true,
    });
    prismaMock.$transaction.mockImplementation(
      async (fn: (_tx: unknown) => Promise<unknown>) => {
        const tx = {
          savingsGoal: {
            updateMany: prismaMock.savingsGoalUpdateMany,
          },
          accountRegister: {
            updateMany: prismaMock.accountRegisterUpdateMany,
            update: prismaMock.accountRegisterUpdate,
          },
          reoccurrence: {
            updateMany: prismaMock.reoccurrenceUpdateMany,
            deleteMany: prismaMock.reoccurrenceDeleteMany,
          },
          reoccurrenceSplit: {
            deleteMany: prismaMock.reoccurrenceSplitDeleteMany,
          },
          registerEntry: {
            deleteMany: prismaMock.registerEntryDeleteMany,
          },
          reoccurrenceSkip: {
            deleteMany: prismaMock.reoccurrenceSkipDeleteMany,
          },
          reoccurrencePlaidNameAlias: {
            deleteMany: prismaMock.reoccurrencePlaidNameAliasDeleteMany,
          },
        };
        return fn(tx);
      },
    );
    const mod = await import("../account-register.delete");
    handler = mod.default;
  });

  it("never calls accountRegister.delete (P2003 regression)", async () => {
    const { getQuery } = await import("h3");
    (getQuery as any).mockReturnValue({
      accountRegisterId: String(accountRegisterId),
    });
    (globalThis as any).getQuery.mockReturnValue({
      accountRegisterId: String(accountRegisterId),
    });

    await handler({});

    expect(prismaMock.accountRegisterDelete).not.toHaveBeenCalled();
    expect(prismaMock.accountRegisterUpdate).toHaveBeenCalledWith({
      where: { id: accountRegisterId },
      data: { isArchived: true },
    });
  });

  it("runs FK cleanup and data removal in a single transaction before archive", async () => {
    const { getQuery } = await import("h3");
    (getQuery as any).mockReturnValue({
      accountRegisterId: String(accountRegisterId),
    });
    (globalThis as any).getQuery.mockReturnValue({
      accountRegisterId: String(accountRegisterId),
    });

    const userAccountScope = {
      userAccounts: { some: { userId } },
    };

    await handler({});

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);

    expect(prismaMock.savingsGoalUpdateMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { sourceAccountRegisterId: accountRegisterId },
          { targetAccountRegisterId: accountRegisterId },
        ],
        account: userAccountScope,
      },
      data: { isArchived: true },
    });

    expect(prismaMock.accountRegisterUpdateMany).toHaveBeenCalledWith({
      where: {
        account: userAccountScope,
        targetAccountRegisterId: accountRegisterId,
      },
      data: { targetAccountRegisterId: null },
    });
    expect(prismaMock.accountRegisterUpdateMany).toHaveBeenCalledWith({
      where: {
        account: userAccountScope,
        collateralAssetRegisterId: accountRegisterId,
      },
      data: { collateralAssetRegisterId: null },
    });
    expect(prismaMock.accountRegisterUpdateMany).toHaveBeenCalledWith({
      where: {
        account: userAccountScope,
        subAccountRegisterId: accountRegisterId,
      },
      data: { subAccountRegisterId: null },
    });

    expect(prismaMock.reoccurrenceUpdateMany).toHaveBeenCalledWith({
      where: {
        transferAccountRegisterId: accountRegisterId,
        account: userAccountScope,
      },
      data: { transferAccountRegisterId: null },
    });

    expect(prismaMock.reoccurrenceSplitDeleteMany).toHaveBeenCalledWith({
      where: {
        transferAccountRegisterId: accountRegisterId,
        reoccurrence: {
          account: userAccountScope,
        },
      },
    });
    expect(prismaMock.reoccurrenceSplitDeleteMany).toHaveBeenCalledWith({
      where: {
        reoccurrence: { accountRegisterId },
      },
    });

    expect(prismaMock.registerEntryDeleteMany).toHaveBeenCalledWith({
      where: { accountRegisterId },
    });
    expect(prismaMock.reoccurrenceSkipDeleteMany).toHaveBeenCalledWith({
      where: { accountRegisterId },
    });
    expect(
      prismaMock.reoccurrencePlaidNameAliasDeleteMany,
    ).toHaveBeenCalledWith({
      where: { accountRegisterId },
    });
    expect(prismaMock.reoccurrenceDeleteMany).toHaveBeenCalledWith({
      where: { accountRegisterId },
    });
  });

  it("enqueues recalculate for the owning account", async () => {
    const { getQuery } = await import("h3");
    const { addRecalculateJob } = await import("~/server/clients/queuesClient");
    (getQuery as any).mockReturnValue({
      accountRegisterId: String(accountRegisterId),
    });
    (globalThis as any).getQuery.mockReturnValue({
      accountRegisterId: String(accountRegisterId),
    });

    await handler({});

    expect(addRecalculateJob).toHaveBeenCalledWith({ accountId });
  });

  it("invokes register entry removal before reoccurrence deleteMany", async () => {
    const { getQuery } = await import("h3");
    (getQuery as any).mockReturnValue({
      accountRegisterId: String(accountRegisterId),
    });
    (globalThis as any).getQuery.mockReturnValue({
      accountRegisterId: String(accountRegisterId),
    });

    await handler({});

    const registerEntryOrder =
      prismaMock.registerEntryDeleteMany.mock.invocationCallOrder[0] as number;
    const reoccurrenceOrder =
      prismaMock.reoccurrenceDeleteMany.mock.invocationCallOrder[0] as number;
    expect(registerEntryOrder).toBeLessThan(reoccurrenceOrder);
  });
});
