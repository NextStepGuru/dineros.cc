import moment from "moment";
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

    const balance = lookupAccountRegister.balance + +amount;
    const targetBalance = balance; // Always use the running balance

    // Use explicit forecastDate if provided, otherwise fall back to existing logic
    const entryDate =
      forecastDate ||
      (isManualEntry && manualCreatedAt
        ? manualCreatedAt
        : reoccurrence?.lastAt);

    const createdAt = moment(entryDate)
      .utc()
      .set(
        isBalanceEntry
          ? {
              hour: 23,
              minute: 59,
              second: 59,
              milliseconds: 0,
            }
          : { hour: 0, minute: 0, second: 0, milliseconds: 0 }
      );

    // Use passed isPending value if available, otherwise calculate it based on date
    const calculatedIsPending = createdAt.isSameOrBefore(
      moment().utc().set({ hour: 0, minute: 0, second: 0, milliseconds: 0 })
    );
    const entryIsPending =
      isPending !== undefined ? isPending : calculatedIsPending;

    const entry: CacheRegisterEntry = {
      id: id || createId(),
      seq: null,
      accountRegisterId,
      sourceAccountRegisterId: sourceAccountRegisterId || null,
      description,
      amount, // always use the passed-in amount
      balance: isBalanceEntry ? amount : balance, // For balance entries, use amount as the opening balance
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
      lookupAccountRegister.balance = targetBalance;
      this.cache.accountRegister.update(lookupAccountRegister);
    }
  }

  async updateEntryStatuses(accountId: number): Promise<void> {
    const now = moment()
      .utc()
      .set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      })
      .toDate();

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

    // Update Manual Entries if past current date to Pending
    await this.db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        accountRegisterId: accountId,
        isCleared: false,
        isManualEntry: true,
        createdAt: { lte: now },
      },
    });

    await this.db.registerEntry.updateMany({
      data: { isPending: false },
      where: {
        accountRegisterId: accountId,
        isManualEntry: true,
        isCleared: false,
        createdAt: { gt: now },
      },
    });
  }

  calculateRunningBalances(
    entries: CacheRegisterEntry[],
    initialBalance: number,
    accountType: "credit" | "debit"
  ): CacheRegisterEntry[] {
    const preSortedData = entries.map(
      ({
        id,
        amount,
        balance,
        createdAt,
        description,
        isBalanceEntry,
        isCleared,
        isManualEntry,
        isPending,
        isProjected,
        isReconciled,
        reoccurrenceId,
        sourceAccountRegisterId,
        seq,
        accountRegisterId,
      }) => ({
        id,
        seq,
        accountRegisterId,
        amount,
        balance,
        createdAt,
        description,
        hasBalanceReCalc: false,
        isBalanceEntry,
        isCleared,
        isManualEntry,
        isPending,
        isProjected,
        isReconciled,
        reoccurrenceId,
        sourceAccountRegisterId,
      })
    );

    return recalculateRunningBalanceAndSort<CacheRegisterEntry>({
      registerEntries: preSortedData,
      balance: initialBalance,
      type: accountType,
    });
  }

  filterSkippedEntries(entries: CacheRegisterEntry[]): CacheRegisterEntry[] {
    return entries.filter((item) => {
      // Never filter out balance entries
      if (item.isBalanceEntry) {
        return true;
      }

      const isFound = this.cache.reoccurrenceSkip.findOne({
        accountRegisterId: item.accountRegisterId,
        reoccurrenceId: item.reoccurrenceId || undefined,
        skippedAt: item.createdAt.toISOString(),
      });
      return !isFound;
    });
  }

  async cleanupZeroBalanceEntries(): Promise<void> {
    await this.db.registerEntry.deleteMany({
      where: {
        description: "Latest Balance",
        amount: 0,
        isProjected: false,
      },
    });
  }

  async cleanupProjectedEntries(accountId: number): Promise<void> {
    await this.db.registerEntry.deleteMany({
      where: {
        accountRegisterId: accountId,
        isProjected: true,
        isPending: false,
        isManualEntry: false,
      },
    });
  }

  createBalanceEntry(accountRegister: CacheAccountRegister): void {
    log({
      message: "Calling createBalanceEntry",
      data: {
        accountRegisterId: accountRegister.id,
        latestBalance: accountRegister.latestBalance,
      },
      level: "debug",
    });

    // Create balance entry with the latest balance as the opening balance
    const balanceEntryParams = {
      id: `balance-${accountRegister.id}-${createId()}`, // Generate unique ID for balance entry
      accountRegisterId: accountRegister.id,
      description: "Latest Balance",
      amount: accountRegister.latestBalance, // Set amount to the opening balance
      isBalanceEntry: true,
      // Use the latestBalance as the opening balance for this account
      forecastDate: moment()
        .utc()
        .set({ hour: 23, minute: 59, second: 59, milliseconds: 0 })
        .toDate(),
    };

    log({
      message: "Creating balance entry with params",
      data: balanceEntryParams,
      level: "debug",
    });

    this.createEntry(balanceEntryParams);

    // Update the account register's balance to match the latest balance
    // This ensures the running balance calculation starts from the correct opening balance
    accountRegister.balance = accountRegister.latestBalance;
    this.cache.accountRegister.update(accountRegister);
  }
}
