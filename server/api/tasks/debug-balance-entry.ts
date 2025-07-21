import {
  ForecastEngineFactory,
  dateTimeService,
} from "~/server/services/forecast";
import { prisma } from "~/server/clients/prismaClient";
import moment from "moment";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const accountId =
    (query.accountId as string) || "3f8c9e1a-5b4d-4e2f-9c3b-7a8d9e0f1b2c";
  const accountRegisterId = (query.accountRegisterId as string) || "62";

  const engine = ForecastEngineFactory.create(prisma);

  // Run the forecast to populate the cache
  const context = {
    accountId,
    startDate: dateTimeService.now().startOf("month").toDate(),
    endDate: dateTimeService.now().add(2, "years").toDate(),
  };

  // Get the cache before running forecast
  const cacheBefore = engine.getCache();

  // Run forecast
  await engine.recalculate(context);

  // Get the cache after running forecast
  const cacheAfter = engine.getCache();

  // Find balance entries in cache
  const balanceEntriesBefore = cacheBefore.registerEntry
    .find({})
    .filter((e: any) => e.isBalanceEntry);
  const balanceEntriesAfter = cacheAfter.registerEntry
    .find({})
    .filter((e: any) => e.isBalanceEntry);

  // Find specific account register
  const accountRegister = cacheAfter.accountRegister.findOne({
    id: parseInt(accountRegisterId),
  });

  // Find balance entries for specific account
  const specificBalanceEntries = balanceEntriesAfter.filter(
    (e: any) => e.accountRegisterId === parseInt(accountRegisterId)
  );

  return {
    accountId,
    accountRegisterId: parseInt(accountRegisterId),
    accountRegister,
    balanceEntriesBefore: balanceEntriesBefore.length,
    balanceEntriesAfter: balanceEntriesAfter.length,
    specificBalanceEntries: specificBalanceEntries.map((e: any) => ({
      id: e.id,
      accountRegisterId: e.accountRegisterId,
      description: e.description,
      amount: e.amount,
      balance: e.balance,
      isBalanceEntry: e.isBalanceEntry,
      createdAt: e.createdAt.toISOString(),
    })),
    allBalanceEntries: balanceEntriesAfter.map((e: any) => ({
      id: e.id,
      accountRegisterId: e.accountRegisterId,
      description: e.description,
      amount: e.amount,
      balance: e.balance,
      isBalanceEntry: e.isBalanceEntry,
    })),
  };
});
