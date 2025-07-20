import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";

export default defineEventHandler(async () => {
  try {
    // Get all entries with their pending status
    const entries = await PrismaDb.registerEntry.findMany({
      where: {
        isCleared: false,
      },
      select: {
        id: true,
        accountRegisterId: true,
        description: true,
        createdAt: true,
        isPending: true,
        isProjected: true,
        isManualEntry: true,
        isBalanceEntry: true,
        amount: true,
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
        createdAt: "asc",
      },
      take: 20, // Limit to first 20 entries for readability
    });

    // Group by pending status
    const pendingEntries = entries.filter(e => e.isPending);
    const nonPendingEntries = entries.filter(e => !e.isPending);

    // Count by type
    const projectedPending = pendingEntries.filter(e => e.isProjected && !e.isManualEntry).length;
    const manualPending = pendingEntries.filter(e => e.isManualEntry).length;
    const balanceEntries = entries.filter(e => e.isBalanceEntry).length;

    const result = {
      totalEntries: entries.length,
      pendingEntries: pendingEntries.length,
      nonPendingEntries: nonPendingEntries.length,
      projectedPending,
      manualPending,
      balanceEntries,
      sampleEntries: entries.slice(0, 10), // Show first 10 entries
    };

    log({
      message: "Pending status check",
      data: result,
      level: "info",
    });

    return result;
  } catch (error) {
    log({
      message: "Error checking pending status",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
      level: "error",
    });
    throw error;
  }
});
