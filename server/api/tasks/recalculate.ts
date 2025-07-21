import {
  ForecastEngineFactory,
  dateTimeService,
} from "~/server/services/forecast";
import { prisma } from "~/server/clients/prismaClient";
import moment from "moment";
import { MAX_YEARS } from "~/consts";

export default defineEventHandler(async (event) => {
  // Get accountId from query params for single account processing
  const query = getQuery(event);
  const singleAccountId = query.accountId as string;

  let accountsToProcess: { accountId: string }[];

  if (singleAccountId) {
    // Process single account if specified
    const accountExists = await prisma.accountRegister.findFirst({
      where: { accountId: singleAccountId, isArchived: false },
    });

    if (!accountExists) {
      return {
        success: false,
        message: `Account ${singleAccountId} not found in database.`,
        entriesCalculated: 0,
        accountRegisters: 0,
      };
    }

    accountsToProcess = [{ accountId: singleAccountId }];
  } else {
    // Get all unique accounts with non-archived registers
    accountsToProcess = await prisma.accountRegister.findMany({
      where: { isArchived: false, account: { isArchived: false } },
      select: { accountId: true },
      distinct: ["accountId"],
    });

    if (accountsToProcess.length === 0) {
      return {
        success: false,
        message:
          "No accounts found in database. Please create an account first.",
        entriesCalculated: 0,
        accountRegisters: 0,
      };
    }
  }

  const results = [];
  let totalEntries = 0;
  let totalAccountRegisters = 0;
  let failedAccounts = [];

  for (const account of accountsToProcess) {
    try {
      // Create a fresh engine instance for each account to prevent cache pollution
      const engine = ForecastEngineFactory.create(prisma);

      const context = {
        accountId: account.accountId,
        startDate: dateTimeService.now().startOf("month").toDate(),
        endDate: dateTimeService.now().add(MAX_YEARS, "years").toDate(),
      };

      const result = await engine.recalculate(context);

      if (result.isSuccess) {
        // Calculate entry breakdowns
        const entriesProjected = result.registerEntries.filter(
          (entry) => entry.isProjected
        ).length;
        const entriesHistorical = result.registerEntries.filter(
          (entry) => !entry.isProjected && !entry.isBalanceEntry
        ).length;
        const entriesBalance = result.registerEntries.filter(
          (entry) => entry.isBalanceEntry
        ).length;

        results.push({
          accountId: account.accountId,
          success: true,
          entriesCalculated: result.registerEntries.length,
          entriesProjected,
          entriesHistorical,
          entriesBalance,
          accountRegisters: result.accountRegisters.length,
        });

        totalEntries += result.registerEntries.length;
        totalAccountRegisters += result.accountRegisters.length;
      } else {
        failedAccounts.push({
          accountId: account.accountId,
          errors: result.errors || ["Unknown error"],
        });
      }
    } catch (error) {
      failedAccounts.push({
        accountId: account.accountId,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      });
    }
  }

  return {
    success: true,
    processedAccounts: results.length,
    totalEntriesCalculated: totalEntries,
    totalAccountRegisters: totalAccountRegisters,
    failedAccounts: failedAccounts.length > 0 ? failedAccounts : undefined,
    results: singleAccountId ? results[0] : results,
  };
});
