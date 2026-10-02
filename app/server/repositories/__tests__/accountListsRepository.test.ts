import { describe, expect, it, vi } from "vitest";
import { createPrismaAccountListsRepository } from "../accountListsRepository";

function createDb() {
  return {
    userAccount: { findMany: vi.fn() },
    reoccurrence: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
    interval: { findMany: vi.fn() },
    accountType: { findMany: vi.fn() },
    evmChain: { findMany: vi.fn() },
    accountRegister: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
    category: { findMany: vi.fn() },
    savingsGoal: { findMany: vi.fn() },
  } as any;
}

describe("createPrismaAccountListsRepository", () => {
  it("loads memberships scoped to the user with capability fields", async () => {
    const db = createDb();
    const membership = { userId: 7, accountId: "acct-1", canViewBudgets: true };
    db.userAccount.findMany.mockResolvedValue([membership]);
    const repo = createPrismaAccountListsRepository(db);

    await expect(repo.loadMemberships(7)).resolves.toEqual([membership]);

    expect(db.userAccount.findMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      select: {
        userId: true,
        accountId: true,
        canViewBudgets: true,
        canInviteUsers: true,
        canManageMembers: true,
        allowedBudgetIds: true,
        allowedAccountRegisterIds: true,
      },
    });
  });

  it("loads every list aggregate in parallel, user-scoped and omitting plaid secrets", async () => {
    const db = createDb();
    for (const model of [
      "reoccurrence",
      "budget",
      "interval",
      "accountType",
      "evmChain",
      "accountRegister",
      "account",
      "category",
      "savingsGoal",
    ] as const) {
      db[model].findMany.mockResolvedValue([{ from: model }]);
    }
    const repo = createPrismaAccountListsRepository(db);

    const result = await repo.loadRawLists(7);

    expect(result).toEqual({
      reoccurrences: [{ from: "reoccurrence" }],
      budgets: [{ from: "budget" }],
      intervals: [{ from: "interval" }],
      accountTypes: [{ from: "accountType" }],
      evmChains: [{ from: "evmChain" }],
      accountRegisters: [{ from: "accountRegister" }],
      accounts: [{ from: "account" }],
      categories: [{ from: "category" }],
      savingsGoals: [{ from: "savingsGoal" }],
    });

    const userAccountFilter = {
      account: { is: { userAccounts: { some: { userId: 7 } } } },
    };
    expect(db.reoccurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: userAccountFilter,
        include: {
          splits: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        },
      }),
    );
    expect(db.budget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isArchived: false }),
      }),
    );
    expect(db.accountRegister.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isArchived: false, ...userAccountFilter },
        omit: {
          plaidAccessToken: true,
          plaidJson: true,
          alchemyJson: true,
        },
      }),
    );
    expect(db.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isArchived: false }),
      }),
    );
  });
});
