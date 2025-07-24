import type { PrismaClient } from "@prisma/client";
import type { IRegisterEntryService, CreateEntryParams } from "./types";
import type {
  CacheRegisterEntry,
  CacheAccountRegister,
} from "./ModernCacheService";
import { ModernCacheService } from "./ModernCacheService";
import { recalculateRunningBalanceAndSort } from "~/lib/sort";
import { IS_CREDIT_TYPE_IDS } from "~/consts";
import { log } from "../../logger";
import { createId } from "@paralleldrive/cuid2";
import { dateTimeService } from "./DateTimeService";

export class RegisterEntryService implements IRegisterEntryService {
  constructor(private db: PrismaClient, private cache: ModernCacheService) {}

  createEntry(params: CreateEntryParams): void {
    const {
      id,
      accountRegisterId,
      sourceAccountRegisterId,
      description,
      amount,
      reoccurrence,
      manualCreatedAt,
      forecastDate,
      isBalanceEntry = false,
      isManualEntry = false,
      isPending,
    } = params;

    if (params.isBalanceEntry) {
      log({
        message: "Creating balance entry",
        data: params,
        level: "debug",
      });
    }

    const lookupAccountRegister = this.cache.accountRegister.findOne({
      id: accountRegisterId,
    });

    if (!lookupAccountRegister) {
      log({
        message: `Creating entry for AccountRegister ${accountRegisterId}`,
        level: "error",
      });
      throw new Error(`Account not found ${accountRegisterId}`);
    }

    // Convert amount to number to handle Decimal objects and strings
    const numericAmount = +amount;
    const balance = +lookupAccountRegister.balance + numericAmount;
    const targetBalance = balance; // Always use the running balance

    // Use explicit forecastDate if provided, otherwise fall back to existing logic
    const entryDate =
      forecastDate ||
      (isManualEntry && manualCreatedAt
        ? manualCreatedAt
        : reoccurrence?.lastAt);

    const createdAt = dateTimeService.set(
      isBalanceEntry
        ? {
            hour: 23,
            minute: 59,
            second: 59,
            milliseconds: 0,
          }
        : { hour: 0, minute: 0, second: 0, milliseconds: 0 },
      dateTimeService.createUTC(entryDate)
    );

    // Use passed isPending value if available, otherwise calculate it based on date
    const calculatedIsPending = dateTimeService.isSameOrBefore(
      createdAt,
      dateTimeService.set({ hour: 0, minute: 0, second: 0, milliseconds: 0 })
    );
    const entryIsPending =
      isPending !== undefined ? isPending : calculatedIsPending;

    const entry: CacheRegisterEntry = {
      id: id || createId(),
      seq: null,
      accountRegisterId,
      sourceAccountRegisterId: sourceAccountRegisterId || null,
      description,
      amount: numericAmount, // convert to number to handle Decimal objects and strings
      balance: isBalanceEntry ? numericAmount : balance, // For balance entries, use amount as the opening balance
      createdAt,
      reoccurrenceId: reoccurrence?.id || null,
      isBalanceEntry,
      isPending: entryIsPending,
      isCleared: false,
      isProjected: isBalanceEntry ? true : isManualEntry ? false : true,
      isManualEntry,
      isReconciled: false,
    };

    this.cache.registerEntry.insert(entry);
    if (entry.isBalanceEntry) {
      log({
        message: "Inserted balance entry into cache",
        data: {
          id: entry.id,
          accountRegisterId: entry.accountRegisterId,
          description: entry.description,
          amount: entry.amount,
          balance: entry.balance,
          isBalanceEntry: entry.isBalanceEntry,
        },
        level: "debug",
      });
    }

    // Update account balance
    if (!isBalanceEntry) {
      lookupAccountRegister.balance = +targetBalance;
      this.cache.accountRegister.update(lookupAccountRegister);
    }
  }

  async updateEntryStatuses(accountId: number): Promise<void> {
    const now = dateTimeService.toDate(
      dateTimeService.set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      })
    );

    // Update Projected Entries if past current date
    await this.db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        accountRegisterId: accountId,
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { lte: now },
      },
    });

    await this.db.registerEntry.updateMany({
      data: { isPending: false },
      where: {
        accountRegisterId: accountId,
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { gt: now },
      },
    });
  }

  calculateRunningBalances(
    entries: CacheRegisterEntry[],
    initialBalance: number,
    accountType: "credit" | "debit"
  ): CacheRegisterEntry[] {
    // Sort entries by date and amount (descending for same date)
    const sortedEntries = recalculateRunningBalanceAndSort(entries);

    let runningBalance = initialBalance;

    // Calculate running balances
    for (const entry of sortedEntries) {
      if (accountType === "credit") {
        // For credit accounts, positive amounts reduce debt (good)
        runningBalance = runningBalance - entry.amount;
      } else {
        // For debit accounts, positive amounts increase balance (good)
        runningBalance = runningBalance + entry.amount;
      }

      entry.balance = runningBalance;
    }

    return sortedEntries;
  }

  filterSkippedEntries(entries: CacheRegisterEntry[]): CacheRegisterEntry[] {
    // Filter out entries that have been skipped
    return entries.filter((entry) => {
      if (!entry.reoccurrenceId) {
        return true; // Keep non-reoccurring entries
      }

      // Check if this entry's date is in the skip list
      const skipDate = dateTimeService.format(entry.createdAt, "YYYY-MM-DD");
      const skips = this.cache.reoccurrenceSkip.find({
        reoccurrenceId: entry.reoccurrenceId,
      });

      return !skips.some((skip) => skip.skippedAt === skipDate);
    });
  }

  async cleanupZeroBalanceEntries(): Promise<void> {
    // Remove entries with zero amounts (except balance entries)
    const zeroEntries = this.cache.registerEntry.find(
      (entry) => entry.amount === 0 && !entry.isBalanceEntry
    );

    for (const entry of zeroEntries) {
      this.cache.registerEntry.remove({ id: entry.id });
    }
  }

  async cleanupProjectedEntries(accountId: number): Promise<void> {
    // Remove all projected entries for the account
    const projectedEntries = this.cache.registerEntry.find({
      accountRegisterId: accountId,
      isProjected: true,
    });

    for (const entry of projectedEntries) {
      this.cache.registerEntry.remove({ id: entry.id });
    }
  }

  createBalanceEntry(accountRegister: CacheAccountRegister): void {
    this.createEntry({
      accountRegisterId: accountRegister.id,
      description: `Balance for ${accountRegister.name}`,
      amount: accountRegister.balance,
      isBalanceEntry: true,
      isManualEntry: false,
      forecastDate: dateTimeService.nowDate(),
    });
  }
}
