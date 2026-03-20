import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import { z } from "zod";
import { getUser } from "../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { recalculateRunningBalanceAndSort } from "~/lib/sort";
import { dateTimeService } from "~/server/services/forecast";
import { calculateAdjustedBalance } from "~/lib/calculateAdjustedBalance";
import { paginateFutureRegisterWindow } from "~/server/lib/registerFuturePagination";

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

    /** Transfers to/from loans: peer register id on the other leg (payer or loan). Description matching is unreliable (encryption / wording). */
    const loanTransferPeerIds = new Set<number>();
    if (direction === "future" && accountId) {
      const paidFromHere = await PrismaDb.accountRegister.findMany({
        where: {
          accountId,
          targetAccountRegisterId: accountRegisterId,
        },
        select: { id: true },
      });
      for (const r of paidFromHere) loanTransferPeerIds.add(r.id);
      if (accountRegister.targetAccountRegisterId != null) {
        loanTransferPeerIds.add(accountRegister.targetAccountRegisterId);
      }
    }

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
              OR: [
                { isCleared: false, isProjected: true },
                { isProjected: false, isCleared: false, isPending: true },
                // Include balance row even when cleared — otherwise the Future anchor is missing
                // and pagination slices from 0 (only pending), hiding projected loan payments.
                { isBalanceEntry: true },
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
              OR: [
                { isCleared: false, isProjected: true },
                { isProjected: false, isCleared: false, isPending: true },
                { isBalanceEntry: true },
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
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
      take: fetchLimit,
    });

    const registerEntriesWithoutPlaidJson = allRegisterEntries.map(
      ({ plaidJson: _plaidJson, ...rest }) => rest,
    );

    const pocketBalances = await PrismaDb.accountRegister.findMany({
      where: {
        subAccountRegisterId: accountRegisterId,
      },
      select: {
        balance: true,
      },
    });

    const balance = calculateAdjustedBalance(
      accountRegister.latestBalance,
      pocketBalances,
    );

    // Legacy: credit account Interest Charge entries were stored as positive; correct at read time so running balance and sums are correct
    const toAmount = (entry: {
      amount: unknown;
      typeId?: number | null;
      description?: string;
    }) => {
      const n = Number(entry.amount);
      const isLegacyInterest =
        accountRegister.type.isCredit &&
        n > 0 &&
        (entry.typeId === 2 || entry.description === "Interest Charge");
      if (isLegacyInterest) return -n;
      return n;
    };

    // For quick mode, skip expensive sorting and return basic data
    if (isQuickMode) {
      // Convert Decimal values to numbers for the sort function
      const convertedEntries = registerEntriesWithoutPlaidJson.map(
        (entry) => ({
          ...entry,
          amount: toAmount(entry),
          balance: Number(entry.balance),
        }),
      );

      // Full mode: expensive but complete processing
      let balanceUpdated = recalculateRunningBalanceAndSort({
        registerEntries: convertedEntries,
        balance,
        type: accountRegister.type.isCredit ? "credit" : "debit",
      });

      // Credit: never show running balance above 0 when payments exceed balance (legacy or pre-cap data)
      if (accountRegister.type.isCredit) {
        balanceUpdated = balanceUpdated.map(
          (entry: { balance: number; [k: string]: unknown }) => ({
            ...entry,
            balance: Number(entry.balance) > 0 ? 0 : entry.balance,
          }),
        ) as typeof balanceUpdated;
      }

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

      const firstEntry = balanceUpdated[0]!;
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

    // Convert Decimal values to numbers for the sort function (toAmount corrects legacy interest sign for credit)
    const convertedEntries = registerEntriesWithoutPlaidJson.map(
      (entry) => ({
        ...entry,
        amount: toAmount(entry),
        balance: Number(entry.balance),
      }),
    );

    // Full mode: expensive but complete processing
    let balanceUpdated = recalculateRunningBalanceAndSort({
      registerEntries: convertedEntries,
      balance,
      type: accountRegister.type.isCredit ? "credit" : "debit",
    });

    // Credit: never show running balance above 0 when payments exceed balance (legacy or pre-cap data)
    if (accountRegister.type.isCredit) {
      balanceUpdated = balanceUpdated.map(
        (entry: { balance: number; [k: string]: unknown }) => ({
          ...entry,
          balance: Number(entry.balance) > 0 ? 0 : entry.balance,
        }),
      ) as typeof balanceUpdated;
    }

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

    const firstEntry = balanceUpdated[0]!;
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
