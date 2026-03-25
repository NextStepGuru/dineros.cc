import {
  ForecastEngineFactory,
  dateTimeService,
} from "~/server/services/forecast";
import { prisma } from "~/server/clients/prismaClient";
import { log } from "../../logger";

export default defineEventHandler(async () => {
  try {
    log({ message: "[test-forecast] Starting test forecast...", level: "debug" });

    // Use the new ForecastEngine directly
    const engine = ForecastEngineFactory.create(prisma);
    const context = {
      accountId: "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c", // Use the account ID from the check-balance-entries result
      startDate: dateTimeService.now().startOf("month").toDate(),
      endDate: dateTimeService.now().add(2, "years").toDate(),
      logging: {
        enabled: false, // Disable all forecast engine logging - this prevents the verbose logs you were seeing
        // You can also use:
        // enabled: true, level: 'warn'  // Only show warnings and errors
        // enabled: true, level: 'debug' // Show all logs including debug info
      },
    };

    log({ message: "[test-forecast] Running forecast with context:", data: context, level: "debug" });

    const result = await engine.recalculate(context);

    log({ message: "[test-forecast] Forecast result:", data: {
      isSuccess: result.isSuccess,
      registerEntriesCount: result.registerEntries?.length || 0,
      errors: result.errors,
    }, level: "debug" });

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

    log({ message: "[test-forecast] Balance entries in cache after forecast:", data: {
      count: balanceEntries.length,
      entries: balanceEntries.map((e: any) => ({
        id: e.id,
        accountRegisterId: e.accountRegisterId,
        description: e.description,
      })),
    }, level: "debug" });

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

    log({ message: "[test-forecast] Balance entries in database after forecast:", data: {
      count: dbBalanceEntries.length,
      entries: dbBalanceEntries,
    }, level: "debug" });

    return {
      success: true,
      cacheBalanceEntries: balanceEntries.length,
      dbBalanceEntries: dbBalanceEntries.length,
      totalRegisterEntries: result.registerEntries?.length || 0,
    };
  } catch (error) {
    log({ message: "[test-forecast] Error:", data: error, level: "error" });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});
