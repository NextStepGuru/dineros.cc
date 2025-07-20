import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { log } from "~/server/logger";

export default defineEventHandler(async () => {
  try {
    // Get all yearly reoccurrences (intervalId = 4)
    const yearlyReoccurrences = await PrismaDb.reoccurrence.findMany({
      where: {
        intervalId: 4, // yearly
      },
      select: {
        id: true,
        accountId: true,
        accountRegisterId: true,
        description: true,
        amount: true,
        intervalId: true,
        intervalCount: true,
        lastAt: true,
        endAt: true,
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
        lastAt: "asc",
      },
    });

    // Get all reoccurrences for comparison
    const allReoccurrences = await PrismaDb.reoccurrence.findMany({
      select: {
        id: true,
        description: true,
        intervalId: true,
        intervalCount: true,
        lastAt: true,
        amount: true,
      },
      orderBy: [
        { intervalId: "asc" },
        { lastAt: "asc" },
      ],
    });

    // Group by interval type
    const byInterval = allReoccurrences.reduce((acc, reoccurrence) => {
      const intervalType = reoccurrence.intervalId;
      if (!acc[intervalType]) {
        acc[intervalType] = [];
      }
      acc[intervalType].push(reoccurrence);
      return acc;
    }, {} as Record<number, typeof allReoccurrences>);

    const result = {
      yearlyReoccurrences,
      totalYearly: yearlyReoccurrences.length,
      allReoccurrences: byInterval,
      intervalCounts: Object.keys(byInterval).reduce((acc, intervalId) => {
        acc[intervalId] = byInterval[parseInt(intervalId)].length;
        return acc;
      }, {} as Record<string, number>),
    };

    log({
      message: "Yearly reoccurrences check",
      data: result,
      level: "info",
    });

    return result;
  } catch (error) {
    log({
      message: "Error checking yearly reoccurrences",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
      level: "error",
    });
    throw error;
  }
});
