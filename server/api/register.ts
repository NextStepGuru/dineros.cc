import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { z } from "zod";
import { getUser } from "../lib/getUser";
// import moment from "moment";
import { handleApiError } from "~/server/lib/handleApiError";
import { recalculateRunningBalanceAndSort } from "~/lib/sort";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);

    // Define a Zod schema for the accountId and accountRegisterId
    const querySchema = z.object({
      accountId: z.string().optional(), // Assuming accountId is a UUID
      accountRegisterId: z.coerce.number().default(0),
      focusedAt: z.coerce.date().default(new Date()),
      skip: z.coerce.number().default(0),
      take: z.coerce.number().default(500), // Increased default for better pagination
      direction: z.enum(["future", "past"]).default("future"),
      loadMode: z.enum(["quick", "full"]).default("full"), // Progressive loading mode
    });

    // Parse and validate the accountId and accountRegisterId from the query parameters
    const queryParams = getQuery(event);
    const {
      accountId,
      accountRegisterId,
      focusedAt,
      skip,
      take,
      direction,
      loadMode,
    } = querySchema.parse(queryParams);

    const accountRegister = await PrismaDb.accountRegister.findUniqueOrThrow({
      where: {
        id: accountRegisterId,
      },
      select: {
        id: true,
        balance: true,
        latestBalance: true,
        type: true,
      },
    });

    // For quick mode, limit records and use simpler query
    const isQuickMode = loadMode === "quick";
    const effectiveTake = isQuickMode ? Math.min(take, 50) : take;

    // Get total count for pagination
    const totalCount = await PrismaDb.registerEntry.count({
      where: {
        ...(direction === "past"
          ? {
              OR: [
                { isCleared: true },
                { isBalanceEntry: true },
                { isReconciled: true },
                // Include historical entries that occurred in the past but aren't cleared/reconciled
                {
                  isPending: false,
                  isProjected: false,
                  isCleared: false,
                  createdAt: { lte: new Date() },
                },
              ],
            }
          : {
              OR: [
                { isCleared: false, isProjected: true },
                { isProjected: false, isCleared: false, isPending: true },
                { isBalanceEntry: true, isCleared: false },
                { isProjected: false, isManualEntry: true, isCleared: false },
              ],
            }),
        accountRegisterId,
        register: {
          account: {
            is: {
              userAccounts: {
                some: {
                  userId: user.userId,
                },
              },
              id: accountId,
            },
          },
        },
      },
    });

    // For pagination, we need to load all records up to skip + take to calculate balances correctly
    const allRegisterEntries = await PrismaDb.registerEntry.findMany({
      where: {
        ...(direction === "past"
          ? {
              OR: [
                { isCleared: true },
                { isBalanceEntry: true },
                { isReconciled: true },
                // Include historical entries that occurred in the past but aren't cleared/reconciled
                {
                  isPending: false,
                  isProjected: false,
                  isCleared: false,
                  createdAt: { lte: new Date() },
                },
              ],
            }
          : {
              OR: [
                { isCleared: false, isProjected: true },
                { isProjected: false, isCleared: false, isPending: true },
                { isBalanceEntry: true, isCleared: false },
                { isProjected: false, isManualEntry: true, isCleared: false },
              ],
            }),
        accountRegisterId,
        register: {
          account: {
            is: {
              userAccounts: {
                some: {
                  userId: user.userId,
                },
              },
              id: accountId,
            },
          },
        },
      },
      orderBy: {
        seq: "asc",
      },
      // Load all records up to skip + take for proper balance calculation
      take: skip + effectiveTake,
    });

    const pocketBalances = await PrismaDb.accountRegister.aggregate({
      where: {
        subAccountRegisterId: accountRegisterId,
      },
      _sum: {
        balance: true,
      },
    });

    console.log(
      "balance",
      pocketBalances._sum.balance,
      accountRegister.latestBalance
    );

    const balance =
      accountRegister.latestBalance - (pocketBalances._sum.balance || 0);

    // For quick mode, skip expensive sorting and return basic data
    if (isQuickMode) {
      // Full mode: expensive but complete processing
      const balanceUpdated = recalculateRunningBalanceAndSort({
        registerEntries: allRegisterEntries,
        balance,
        type: accountRegister.type.isCredit ? "credit" : "debit",
      });

      // For pagination, return only the requested slice
      const paginatedEntries = balanceUpdated.slice(skip, skip + effectiveTake);

      const entryWithLowestBalance = balanceUpdated.reduce(
        (minEntry, entry) => {
          return entry.balance < minEntry.balance ? entry : minEntry;
        },
        balanceUpdated[0]
      );

      const entryWithHighestBalance = balanceUpdated.reduce(
        (minEntry, entry) => {
          return entry.balance > minEntry.balance ? entry : minEntry;
        },
        balanceUpdated[0]
      );

      const hasMore = skip + effectiveTake < totalCount;

      return {
        entries: paginatedEntries,
        lowest: entryWithLowestBalance,
        highest: entryWithHighestBalance,
        skip,
        focusedAt,
        take: effectiveTake,
        loadMode: "quick",
        isPartialLoad: true,
        hasMore,
        totalCount,
      };
    }

    // Full mode: expensive but complete processing
    const balanceUpdated = recalculateRunningBalanceAndSort({
      registerEntries: allRegisterEntries,
      balance,
      type: accountRegister.type.isCredit ? "credit" : "debit",
    });

    // For pagination, return only the requested slice
    const paginatedEntries = balanceUpdated.slice(skip, skip + effectiveTake);

    const entryWithLowestBalance = balanceUpdated.reduce((minEntry, entry) => {
      return entry.balance < minEntry.balance ? entry : minEntry;
    }, balanceUpdated[0]);

    const entryWithHighestBalance = balanceUpdated.reduce((minEntry, entry) => {
      return entry.balance > minEntry.balance ? entry : minEntry;
    }, balanceUpdated[0]);

    const hasMore = skip + effectiveTake < totalCount;

    return {
      entries: paginatedEntries,
      lowest: entryWithLowestBalance,
      highest: entryWithHighestBalance,
      skip,
      focusedAt,
      take,
      loadMode: "full",
      isPartialLoad: false,
      hasMore,
      totalCount,
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
