import { ForecastEngineFactory } from "~/server/services/forecast";
import { prisma } from "~/server/clients/prismaClient";
import moment from "moment";

export default defineEventHandler(async () => {
  try {
    console.log("[test-forecast] Starting test forecast...");

    // Use the new ForecastEngine directly
    const engine = ForecastEngineFactory.create(prisma);
    const context = {
      accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c", // Use the account ID from the check-balance-entries result
      startDate: moment().startOf("month").toDate(),
      endDate: moment().add(2, "years").toDate(),
      logging: {
        enabled: false, // Disable all forecast engine logging
      },
    };

    console.log("[test-forecast] Running forecast with context:", context);

    const result = await engine.recalculate(context);

    console.log("[test-forecast] Forecast result:", {
      isSuccess: result.isSuccess,
      registerEntriesCount: result.registerEntries?.length || 0,
      errors: result.errors,
    });

    if (!result.isSuccess) {
      throw new Error(
        `Forecast calculation failed: ${result.errors?.join(", ")}`
      );
    }

    // Check cache state after forecast
    const cache = engine.getCache();
    const balanceEntries = cache.registerEntry
      .find({})
      .filter((e: any) => e.isBalanceEntry);

    console.log("[test-forecast] Balance entries in cache after forecast:", {
      count: balanceEntries.length,
      entries: balanceEntries.map((e: any) => ({
        id: e.id,
        accountRegisterId: e.accountRegisterId,
        description: e.description,
      })),
    });

    // Check database state after forecast
    const dbBalanceEntries = await prisma.registerEntry.findMany({
      where: { isBalanceEntry: true },
      select: {
        id: true,
        accountRegisterId: true,
        description: true,
        createdAt: true,
      },
    });

    console.log("[test-forecast] Balance entries in database after forecast:", {
      count: dbBalanceEntries.length,
      entries: dbBalanceEntries,
    });

    return {
      success: true,
      cacheBalanceEntries: balanceEntries.length,
      dbBalanceEntries: dbBalanceEntries.length,
      totalRegisterEntries: result.registerEntries?.length || 0,
    };
  } catch (error) {
    console.error("[test-forecast] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});
