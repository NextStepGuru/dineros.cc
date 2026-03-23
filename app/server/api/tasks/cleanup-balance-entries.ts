import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";

export default defineEventHandler(async () => {
  try {
    // Get count before cleanup
    const beforeCount = await PrismaDb.registerEntry.count({
      where: {
        isBalanceEntry: true,
      },
    });

    // Delete all balance entries
    const deleteResult = await PrismaDb.registerEntry.deleteMany({
      where: {
        isBalanceEntry: true,
      },
    });

    // Get count after cleanup
    const afterCount = await PrismaDb.registerEntry.count({
      where: {
        isBalanceEntry: true,
      },
    });

    const result = {
      beforeCount,
      afterCount,
      deletedCount: deleteResult.count,
    };

    log({
      message: "Balance entries cleanup completed",
      data: result,
      level: "info",
    });

    return result;
  } catch (error) {
    log({
      message: "Error cleaning up balance entries",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
      level: "error",
    });
    throw error;
  }
});
