import { defineEventHandler } from "h3";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";

export default defineEventHandler(async () => {
  try {
    // Get all balance entries
    const balanceEntries = await PrismaDb.registerEntry.findMany({
      where: {
        isBalanceEntry: true,
      },
      select: {
        id: true,
        accountRegisterId: true,
        description: true,
        createdAt: true,
        register: {
          select: {
            name: true,
            account: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get account register count
    const accountRegisters = await PrismaDb.accountRegister.findMany({
      where: {
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        accountId: true,
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Group balance entries by account register
    const balanceEntriesByAccount = balanceEntries.reduce(
      (acc, entry) => {
        const accountRegisterId = entry.accountRegisterId;
        if (!acc[accountRegisterId]) {
          acc[accountRegisterId] = [];
        }
        acc[accountRegisterId].push(entry);
        return acc;
      },
      {} as Record<number, typeof balanceEntries>,
    );

    const result = {
      totalBalanceEntries: balanceEntries.length,
      totalAccountRegisters: accountRegisters.length,
      balanceEntriesByAccount,
      allBalanceEntries: balanceEntries,
      accountRegisters,
    };

    log({
      message: "Balance entries check",
      data: result,
      level: "info",
    });

    return result;
  } catch (error) {
    log({
      message: "Error checking balance entries",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
      level: "error",
    });
    throw error;
  }
});
