import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { getUser } from "../lib/getUser";
import { defineEventHandler } from "h3";
import { handleApiError } from "~/server/lib/handleApiError";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);

    const reoccurrences = await PrismaDb.reoccurrence.findMany({
      where: {
        account: {
          is: {
            userAccounts: {
              some: {
                userId: user.userId,
              },
            },
          },
        },
      },
      orderBy: [
        { lastAt: "asc" },
        { id: "asc" },
      ],
    });

    const budgets = await PrismaDb.budget.findMany({
      where: {
        isArchived: false,
        userId: user.userId,
      },
    });

    const intervals = await PrismaDb.interval.findMany({});

    const accountTypes = await PrismaDb.accountType.findMany({});

    const accountRegisters = await PrismaDb.accountRegister.findMany({
      where: {
        isArchived: false,
        account: {
          is: {
            userAccounts: {
              some: {
                userId: user.userId,
              },
            },
          },
        },
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    const accounts = await PrismaDb.account.findMany({
      where: {
        userAccounts: {
          some: {
            userId: user.userId,
          },
        },
      },
    });

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
