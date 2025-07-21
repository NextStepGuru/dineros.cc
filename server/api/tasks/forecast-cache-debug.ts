import {
  ForecastEngineFactory,
  dateTimeService,
} from "~/server/services/forecast";
import { prisma } from "~/server/clients/prismaClient";
import moment from "moment";

export default defineEventHandler(async (event) => {
  // Get accountId from query params for single account processing
  const query = getQuery(event);
  const accountId = query.accountId as string | undefined;

  const engine = ForecastEngineFactory.create(prisma);
  // Use a valid date range for ForecastContext
  const context = {
    accountId,
    startDate: dateTimeService.now().startOf("month").toDate(),
    endDate: dateTimeService.now().add(2, "years").toDate(),
  };
  await engine.recalculate(context); // This will populate the cache

  const cache = engine.getCache();
  const accountRegisters = cache.accountRegister.find({});
  const registerEntries = cache.registerEntry.find({});

  // Filter to active account registers
  const activeAccountRegisters = accountRegisters.filter(
    (a: any) => !a.isArchived
  );

  // Group register entries by accountRegisterId
  const entriesByAccount: Record<number, typeof registerEntries> = {};
  for (const entry of registerEntries) {
    if (!entriesByAccount[entry.accountRegisterId]) {
      entriesByAccount[entry.accountRegisterId] = [];
    }
    entriesByAccount[entry.accountRegisterId].push(entry);
  }

  return {
    allAccountRegisters: accountRegisters,
    activeAccountRegisters: activeAccountRegisters,
    entriesByAccount,
    allRegisterEntries: registerEntries,
    balanceEntries: registerEntries.filter((e: any) => e.isBalanceEntry),
  };
});
