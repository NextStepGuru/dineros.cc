import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import { defineEventHandler } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";
import { loadMembershipsForUser } from "~/server/lib/accountMembership";
import {
  filterListsByMembership,
  membershipSummariesForClient,
} from "~/server/lib/filterListsByMembership";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);

    const memberships = await loadMembershipsForUser(user.userId);

    const userAccountFilter = {
      account: {
        is: {
          userAccounts: {
            some: { userId: user.userId },
          },
        },
      },
    };

    const [
      reoccurrences,
      budgets,
      intervals,
      accountTypes,
      accountRegisters,
      accounts,
      categories,
      savingsGoals,
    ] = await Promise.all([
      PrismaDb.reoccurrence.findMany({
        where: userAccountFilter,
        include: {
          splits: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ lastAt: "asc" }, { id: "asc" }],
      }),
      PrismaDb.budget.findMany({
        where: {
          isArchived: false,
          account: {
            userAccounts: { some: { userId: user.userId } },
          },
        },
      }),
      PrismaDb.interval.findMany({}),
      PrismaDb.accountType.findMany({}),
      PrismaDb.accountRegister.findMany({
        where: {
          isArchived: false,
          ...userAccountFilter,
        },
        orderBy: { sortOrder: "asc" },
      }),
      PrismaDb.account.findMany({
        where: {
          userAccounts: { some: { userId: user.userId } },
        },
      }),
      PrismaDb.category.findMany({
        where: {
          isArchived: false,
          account: {
            userAccounts: { some: { userId: user.userId } },
          },
        },
        orderBy: { name: "asc" },
      }),
      PrismaDb.savingsGoal.findMany({
        where: {
          isArchived: false,
          account: {
            userAccounts: { some: { userId: user.userId } },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const filtered = filterListsByMembership(memberships, {
      reoccurrences,
      budgets,
      accountRegisters,
      categories,
      savingsGoals,
      accounts,
    });

    return {
      reoccurrences: filtered.reoccurrences,
      intervals,
      accountTypes,
      accountRegisters: filtered.accountRegisters,
      budgets: filtered.budgets,
      accounts: filtered.accounts,
      categories: filtered.categories,
      savingsGoals: filtered.savingsGoals,
      memberships: membershipSummariesForClient(memberships),
    };
  } catch (error) {
    handleApiError(error);

    throw new Error("An error occurred while fetching lists.");
  }
});
