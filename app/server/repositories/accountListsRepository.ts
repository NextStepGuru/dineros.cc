import type { PrismaClient } from "@prisma/client";
import type { AccountMembershipRow } from "~/server/lib/accountMembership";

/** Raw rows loaded for GET /api/lists before membership filtering. */
export type RawListAggregates = {
  reoccurrences: Awaited<ReturnType<PrismaClient["reoccurrence"]["findMany"]>>;
  budgets: Awaited<ReturnType<PrismaClient["budget"]["findMany"]>>;
  intervals: Awaited<ReturnType<PrismaClient["interval"]["findMany"]>>;
  accountTypes: Awaited<ReturnType<PrismaClient["accountType"]["findMany"]>>;
  evmChains: Awaited<ReturnType<PrismaClient["evmChain"]["findMany"]>>;
  accountRegisters: Awaited<
    ReturnType<PrismaClient["accountRegister"]["findMany"]>
  >;
  accounts: Awaited<ReturnType<PrismaClient["account"]["findMany"]>>;
  categories: Awaited<ReturnType<PrismaClient["category"]["findMany"]>>;
  savingsGoals: Awaited<ReturnType<PrismaClient["savingsGoal"]["findMany"]>>;
};

export interface AccountListsRepository {
  loadMemberships: (_userId: number) => Promise<AccountMembershipRow[]>;
  loadRawLists: (_userId: number) => Promise<RawListAggregates>;
}

export function createPrismaAccountListsRepository(
  db: PrismaClient,
): AccountListsRepository {
  return {
    async loadMemberships(userId: number): Promise<AccountMembershipRow[]> {
      return db.userAccount.findMany({
        where: { userId },
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
    },

    async loadRawLists(userId: number): Promise<RawListAggregates> {
      const userAccountFilter = {
        account: {
          is: {
            userAccounts: {
              some: { userId },
            },
          },
        },
      };

      const [
        reoccurrences,
        budgets,
        intervals,
        accountTypes,
        evmChains,
        accountRegisters,
        accounts,
        categories,
        savingsGoals,
      ] = await Promise.all([
        db.reoccurrence.findMany({
          where: userAccountFilter,
          include: {
            splits: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            },
          },
          orderBy: [{ lastAt: "asc" }, { id: "asc" }],
        }),
        db.budget.findMany({
          where: {
            isArchived: false,
            account: {
              userAccounts: { some: { userId } },
            },
          },
        }),
        db.interval.findMany({}),
        db.accountType.findMany({}),
        db.evmChain.findMany({ orderBy: { id: "asc" } }),
        db.accountRegister.findMany({
          where: {
            isArchived: false,
            ...userAccountFilter,
          },
          orderBy: { sortOrder: "asc" },
          omit: {
            plaidAccessToken: true,
            plaidJson: true,
            alchemyJson: true,
          },
        }),
        db.account.findMany({
          where: {
            userAccounts: { some: { userId } },
          },
        }),
        db.category.findMany({
          where: {
            isArchived: false,
            account: {
              userAccounts: { some: { userId } },
            },
          },
          orderBy: { name: "asc" },
        }),
        db.savingsGoal.findMany({
          where: {
            isArchived: false,
            account: {
              userAccounts: { some: { userId } },
            },
          },
          orderBy: { sortOrder: "asc" },
        }),
      ]);

      return {
        reoccurrences,
        budgets,
        intervals,
        accountTypes,
        evmChains,
        accountRegisters,
        accounts,
        categories,
        savingsGoals,
      };
    },
  };
}
