import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import { defineEventHandler } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);

    const userAccountFilter = {
      account: {
        is: {
          userAccounts: {
            some: { userId: user.userId },
          },
        },
      },
    };

    const [reoccurrences, budgets, intervals, accountTypes, accountRegisters, accounts] =
      await Promise.all([
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
          where: { isArchived: false, userId: user.userId },
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
      ]);

    return {
      reoccurrences,
      intervals,
      accountTypes,
      accountRegisters,
      budgets,
      accounts,
    };
  } catch (error) {
    handleApiError(error);

    throw new Error("An error occurred while fetching lists.");
  }
});
