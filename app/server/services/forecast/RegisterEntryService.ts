import type { PrismaClient } from "@prisma/client";
import type { IRegisterEntryService, CreateEntryParams } from "./types";
import type {
  CacheRegisterEntry,
  CacheAccountRegister, ModernCacheService
} from "./ModernCacheService";
import { recalculateRunningBalanceAndSort } from "../../../lib/sort";
import { roundToCents } from "~/lib/bankers-rounding";
import { log } from "../../logger";
import { createId } from "@paralleldrive/cuid2";
import { dateTimeService } from "./DateTimeService";
import { forecastLogger } from "./logger";

export class RegisterEntryService implements IRegisterEntryService {
  private db: PrismaClient;
  private cache: ModernCacheService;

  constructor(db: PrismaClient, cache: ModernCacheService) {
    this.db = db;
    this.cache = cache;
  }

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
      isProjected: isProjectedOverride,
      isPending,
      typeId,
      categoryId = null,
      reoccurrenceId: explicitReoccurrenceId,
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

    // Convert amount to number and normalize to whole cents (bankers rounding)
    const numericAmount = roundToCents(+amount);
    const balance = +lookupAccountRegister.balance + numericAmount;
    const targetBalance = balance; // Always use the running balance

    // Use explicit forecastDate if provided, otherwise fall back to existing logic
    const entryDate =
      forecastDate ||
      (isManualEntry && manualCreatedAt
        ? manualCreatedAt
        : reoccurrence?.lastAt) ||
      dateTimeService.nowDate();

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
    ).toDate();

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
      reoccurrenceId:
        explicitReoccurrenceId !== undefined
          ? explicitReoccurrenceId
          : (reoccurrence?.id || null),
      typeId: typeId || null,
      isBalanceEntry,
      isPending: entryIsPending,
      isCleared: false,
      isProjected:
        isProjectedOverride !== undefined
          ? isProjectedOverride
          : isBalanceEntry
            ? true
            : isManualEntry
              ? false
              : true,
      isManualEntry,
      isReconciled: false,
      categoryId: categoryId ?? null,
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
    initialBalance: number | undefined,
    accountType: "credit" | "debit"
  ): CacheRegisterEntry[] {
    forecastLogger.debug(
      `calculateRunningBalances called with ${entries?.length || 0} entries`
    );
    forecastLogger.debug(`Entries:`, entries);

    // Sort entries by date and amount (descending for same date)
    const sortedEntries = recalculateRunningBalanceAndSort({
      registerEntries: entries as unknown as any[],
      balance: initialBalance,
      type: accountType,
    }) as unknown as CacheRegisterEntry[];

    return sortedEntries;
  }

  /** YYYY-MM-DD key matching DataLoader's reoccurrenceSkip.skippedAt format. */
  occurrenceSkipDateKey(date: Date | string): string {
    return dateTimeService.format("YYYY-MM-DD", date);
  }

  /**
   * True if any of the candidate dates matches a ReoccurrenceSkip for this
   * reoccurrence (adjusted and/or nominal dates).
   */
  isOccurrenceSkipped(
    reoccurrenceId: number,
    ...candidateDates: Array<Date | string>
  ): boolean {
    const skips = this.cache.reoccurrenceSkip.find({ reoccurrenceId });
    if (skips.length === 0) return false;
    const skipKeys = new Set(
      skips.map((skip) => skip.skippedAt).filter((key) => key.length > 0),
    );
    return candidateDates.some((date) =>
      skipKeys.has(this.occurrenceSkipDateKey(date)),
    );
  }

  filterSkippedEntries(entries: CacheRegisterEntry[]): CacheRegisterEntry[] {
    return entries.filter((entry) => {
      if (!entry.reoccurrenceId) {
        return true;
      }
      return !this.isOccurrenceSkipped(entry.reoccurrenceId, entry.createdAt);
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
    forecastLogger.debug(
      `Creating balance entry for account ${accountRegister.id} on ${dateTimeService.format(
        "YYYY-MM-DD",
        dateTimeService.nowDate()
      )}`
    );
    this.createEntry({
      accountRegisterId: accountRegister.id,
      description: `Balance for ${accountRegister.name}`,
      amount: accountRegister.balance,
      isBalanceEntry: true,
      isManualEntry: false,
      forecastDate: dateTimeService.nowDate(), // Use current date for balance entries
      typeId: 1, // Balance Entry
    });
    forecastLogger.debug(
      `Balance entry created. Cache now has ${
        this.cache.registerEntry.find({}).length
      } entries`
    );
  }
}
