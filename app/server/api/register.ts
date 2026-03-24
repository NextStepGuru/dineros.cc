import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { z } from "zod";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { dateTimeService } from "~/server/services/forecast";
import { paginateFutureRegisterWindow } from "~/server/lib/registerFuturePagination";
import {
  buildFutureLedgerSorted,
  futureRegisterEntryOr,
  resolveLoanTransferPeerIds,
  stripRegisterEntryPlaidJson,
} from "~/server/lib/registerLedgerFuture";

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);

    // Define a Zod schema for the accountId and accountRegisterId
    const querySchema = z.object({
      accountId: z.string().optional(), // Assuming accountId is a UUID
      accountRegisterId: z.coerce.number().default(0),
      focusedAt: z.coerce.date().default(() => dateTimeService.nowDate()),
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
        targetAccountRegisterId: true,
      },
    });

    const loanTransferPeerIds =
      direction === "future" && accountId
        ? await resolveLoanTransferPeerIds(
            PrismaDb,
            accountId,
            accountRegisterId,
            accountRegister.targetAccountRegisterId,
          )
        : new Set<number>();

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
                  createdAt: { lte: focusedAt },
                },
              ],
            }
          : {
              OR: [...futureRegisterEntryOr],
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

    // Future tab: `recalculateRunningBalanceAndSort` reorders rows; a small `take` from DB order
    // (seq, createdAt) can omit projected loan-payment transfers that sort into the visible window.
    // Hydrate with all future-matching rows (capped) so pagination slices the full sorted list.
    const FUTURE_REGISTER_FETCH_CAP = 25_000;
    const fetchLimit =
      direction === "future"
        ? Math.min(totalCount, FUTURE_REGISTER_FETCH_CAP)
        : skip + effectiveTake;

    /** Future tab: sorted order is [pending…, balance, projected…]. Slicing from 0 hides the balance row and projected loan payments when many pending rows exist. */
    const paginateSortedEntries = <
      T extends {
        isBalanceEntry?: boolean;
        isProjected?: boolean;
        typeId?: number | null;
        description?: string | null;
        sourceAccountRegisterId?: number | null;
      },
    >(
      entries: T[],
      pageSkip: number,
      pageSize: number,
    ): { paginated: T[]; hasMore: boolean } => {
      if (direction === "past") {
        return {
          paginated: entries.slice(pageSkip, pageSkip + pageSize),
          hasMore: pageSkip + pageSize < totalCount,
        };
      }
      return paginateFutureRegisterWindow(
        entries,
        pageSkip,
        pageSize,
        loanTransferPeerIds,
      );
    };

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
                  createdAt: { lte: focusedAt },
                },
              ],
            }
          : {
              OR: [...futureRegisterEntryOr],
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
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
      take: fetchLimit,
    });

    const registerEntriesWithoutPlaidJson = stripRegisterEntryPlaidJson(
      allRegisterEntries,
    );

    const pocketBalances = await PrismaDb.accountRegister.findMany({
      where: {
        subAccountRegisterId: accountRegisterId,
      },
      select: {
        balance: true,
      },
    });

    // For quick mode, skip expensive sorting and return basic data
    if (isQuickMode) {
      const balanceUpdated = buildFutureLedgerSorted({
        registerEntriesWithoutPlaidJson,
        latestBalance: accountRegister.latestBalance,
        pocketBalances,
        isCredit: accountRegister.type.isCredit,
      });

      const { paginated: paginatedEntries, hasMore } = paginateSortedEntries(
        balanceUpdated,
        skip,
        effectiveTake,
      );

      if (balanceUpdated.length === 0) {
        return {
          entries: [],
          lowest: undefined,
          highest: undefined,
          skip,
          focusedAt,
          take: effectiveTake,
          loadMode: "quick",
          isPartialLoad: true,
          hasMore: skip + effectiveTake < totalCount,
          totalCount,
        };
      }

      const firstEntry = balanceUpdated[0];
      if (firstEntry === undefined) {
        throw new Error("register quick mode: missing first entry");
      }
      const entryWithLowestBalance = balanceUpdated.reduce(
        (minEntry, entry) => {
          return entry.balance < minEntry.balance ? entry : minEntry;
        },
        firstEntry,
      );

      const entryWithHighestBalance = balanceUpdated.reduce(
        (minEntry, entry) => {
          return entry.balance > minEntry.balance ? entry : minEntry;
        },
        firstEntry,
      );

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

    const balanceUpdated = buildFutureLedgerSorted({
      registerEntriesWithoutPlaidJson,
      latestBalance: accountRegister.latestBalance,
      pocketBalances,
      isCredit: accountRegister.type.isCredit,
    });

    const { paginated: paginatedEntries, hasMore } = paginateSortedEntries(
      balanceUpdated,
      skip,
      effectiveTake,
    );

    const isFutureHydrateTruncated =
      direction === "future" && totalCount > FUTURE_REGISTER_FETCH_CAP;

    if (balanceUpdated.length === 0) {
      return {
        entries: [],
        lowest: undefined,
        highest: undefined,
        skip,
        focusedAt,
        take,
        loadMode: "full",
        isPartialLoad: isFutureHydrateTruncated,
        hasMore: skip + effectiveTake < totalCount,
        totalCount,
      };
    }

    const firstEntry = balanceUpdated[0];
    if (firstEntry === undefined) {
      throw new Error("register full mode: missing first entry");
    }
    const entryWithLowestBalance = balanceUpdated.reduce((minEntry, entry) => {
      return entry.balance < minEntry.balance ? entry : minEntry;
    }, firstEntry);

    const entryWithHighestBalance = balanceUpdated.reduce((minEntry, entry) => {
      return entry.balance > minEntry.balance ? entry : minEntry;
    }, firstEntry);

    return {
      entries: paginatedEntries,
      lowest: entryWithLowestBalance,
      highest: entryWithHighestBalance,
      skip,
      focusedAt,
      take,
      loadMode: "full",
      isPartialLoad: isFutureHydrateTruncated,
      hasMore,
      totalCount,
    };
  } catch (error) {
    handleApiError(error);

    throw error;
  }
});
