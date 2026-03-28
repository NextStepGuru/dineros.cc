import { prisma } from "~/server/clients/prismaClient";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const accountRegisterId = (query.accountRegisterId as string) || "62";

  if (!accountRegisterId) {
    throw createError({
      statusCode: 400,
      statusMessage: "accountRegisterId is required",
    });
  }

  try {
    // Get all entries for this account register
    const allEntries = await prisma.registerEntry.findMany({
      where: {
        accountRegisterId: Number.parseInt(accountRegisterId, 10),
      },
      select: {
        id: true,
        description: true,
        amount: true,
        balance: true,
        isCleared: true,
        isReconciled: true,
        isProjected: true,
        isPending: true,
        isManualEntry: true,
        isBalanceEntry: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Filter entries as the register API does for future direction
    const futureEntries = allEntries.filter((entry) => {
      return entry.isCleared === false && entry.isReconciled === false;
    });

    // Count by type
    const clearedEntries = allEntries.filter((e) => e.isCleared);
    const activeEntries = allEntries.filter((e) => !e.isCleared);
    const balanceEntries = allEntries.filter((e) => e.isBalanceEntry);
    const clearedBalanceEntries = balanceEntries.filter((e) => e.isCleared);

    return {
      accountRegisterId: Number.parseInt(accountRegisterId, 10),
      totalEntries: allEntries.length,
      activeEntries: activeEntries.length,
      clearedEntries: clearedEntries.length,
      balanceEntries: balanceEntries.length,
      clearedBalanceEntries: clearedBalanceEntries.length,
      futureEntries: futureEntries.length,
      sampleEntries: allEntries.slice(0, 5),
      sampleFutureEntries: futureEntries.slice(0, 5),
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
