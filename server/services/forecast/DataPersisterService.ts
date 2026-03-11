import type { PrismaClient } from "@prisma/client";
import type { IDataPersisterService } from "./types";
import type {
  CacheRegisterEntry,
  CacheReoccurrence,
} from "./ModernCacheService";
import { createId } from "@paralleldrive/cuid2";
import { DatabaseRateLimiter } from "./lib/rateLimiter";
import { dateTimeService } from "./DateTimeService";
import { forecastLogger } from "./logger";

export class DataPersisterService implements IDataPersisterService {
  private rateLimiter: DatabaseRateLimiter;

  constructor(private db: PrismaClient) {
    // Limit to 3 concurrent database operations for recalculate
    this.rateLimiter = new DatabaseRateLimiter(3);
  }

  async persistReoccurrenceLastAt(
    reoccurrences: CacheReoccurrence[]
  ): Promise<void> {
    const nowDate = dateTimeService.nowDate();
    const nowMoment = dateTimeService.createUTC(nowDate);
    for (const item of reoccurrences) {
      const lastAtToPersist = this.computeLastRunAtToPersist(item, nowMoment);
      await this.db.reoccurrence.update({
        where: { id: item.id },
        data: {
          lastAt: lastAtToPersist,
          updatedAt: item.updatedAt ?? nowDate,
        },
      });
    }
  }

  /**
   * Advance lastRunAt by interval; only update (persist a newer date) when that next date is still in the past.
   * Respects interval (e.g. monthly on the 2nd stays on the 2nd).
   */
  private computeLastRunAtToPersist(
    item: CacheReoccurrence,
    nowMoment: ReturnType<typeof dateTimeService.createUTC>
  ): Date | null {
    const unit = this.getIntervalUnit(item);
    let current: ReturnType<typeof dateTimeService.createUTC> | null = null;
    if (item.lastRunAt) {
      current = dateTimeService.createUTC(item.lastRunAt);
    } else if (item.lastAt) {
      const lastAtMoment = dateTimeService.createUTC(item.lastAt);
      if (dateTimeService.isSameOrBefore(lastAtMoment, nowMoment)) {
        current = lastAtMoment;
      } else if (unit) {
        const count = item.intervalCount || 1;
        current = lastAtMoment;
        while (dateTimeService.isAfter(current, nowMoment)) {
          current = dateTimeService.subtract(count, unit, current);
        }
      } else {
        current = lastAtMoment;
      }
    }
    if (!current) return null;
    if (!unit) {
      const d = dateTimeService.toDate(current);
      return dateTimeService.isAfter(current, nowMoment)
        ? dateTimeService.toDate(nowMoment)
        : d;
    }
    const count = item.intervalCount || 1;
    let lastRun = current;
    let next = dateTimeService.add(count, unit, lastRun);
    while (dateTimeService.isSameOrBefore(next, nowMoment)) {
      lastRun = next;
      next = dateTimeService.add(count, unit, lastRun);
    }
    return dateTimeService.toDate(lastRun);
  }

  private getIntervalUnit(
    item: CacheReoccurrence
  ): "days" | "weeks" | "months" | "years" | null {
    const name = item.intervalName?.trim().toLowerCase();
    if (name === "once") return null;
    if (name === "day" || name === "days") return "days";
    if (name === "week" || name === "weeks") return "weeks";
    if (name === "month" || name === "months") return "months";
    if (name === "year" || name === "years") return "years";
    switch (item.intervalId) {
      case 1:
        return "days";
      case 2:
        return "weeks";
      case 3:
        return "months";
      case 4:
        return "years";
      case 5:
        return null;
      default:
        return "months";
    }
  }

  async persistForecastResults(
    results: CacheRegisterEntry[]
  ): Promise<Map<string, string>> {
    const idMap = new Map<string, string>();
    // Generate new IDs for all forecast entries to avoid conflicts, except for balance entries
    const insertData = results.map((item) => {
      const newId = item.isBalanceEntry ? item.id : createId();
      if (!item.isBalanceEntry) idMap.set(item.id, newId);
      return {
        ...item,
        createdAt: dateTimeService.formatDate(
          dateTimeService.createUTC(item.createdAt),
          "YYYY-MM-DDTHH:mm:ss.SSS[Z]"
        ),
        id: newId,
      };
    });

    // Use createMany for better performance, fallback to individual creates if needed
    try {
      await this.db.registerEntry.createMany({
        data: insertData,
        skipDuplicates: true,
      });
    } catch (error) {
      // Fallback to individual creates if createMany fails
      forecastLogger.service(
        "DataPersisterService",
        `Using rate-limited fallback for ${insertData.length} entries`
      );

      const operations = insertData.map(
        (item) => () =>
          this.db.registerEntry
            .create({
              data: item,
            })
            .catch(() => {
              // Ignore duplicate key errors
              forecastLogger.service(
                "DataPersisterService",
                `Skipped duplicate entry: ${item.id}`
              );
            })
      );

      await this.rateLimiter.executeWithLimit(operations);

      const status = this.rateLimiter.getStatus();
      forecastLogger.debug(
        `[DataPersisterService] Rate limiter status: ${JSON.stringify(status)}`
      );
    }
    return idMap;
  }

  async updateAccountRegisterBalances(accountId: string): Promise<void> {
    // Get all account registers for this account
    const accountRegisters = await this.db.accountRegister.findMany({
      where: { accountId },
      select: { id: true, balance: true, latestBalance: true },
    });

    // Update the latestBalance field to match the current balance
    // This ensures that future recalculations will use the current balance as the opening balance
    forecastLogger.info(
      `[DataPersisterService] Updating ${accountRegisters.length} account register balances with rate limiting`
    );

    const updateOperations = accountRegisters.map(
      (accountRegister) => () =>
        this.db.accountRegister.update({
          where: { id: accountRegister.id },
          data: { latestBalance: accountRegister.balance },
        })
    );

    await this.rateLimiter.executeWithLimit(updateOperations);

    const status = this.rateLimiter.getStatus();
    forecastLogger.debug(
      `[DataPersisterService] Updated latestBalance for ${
        accountRegisters.length
      } account registers. Rate limiter status: ${JSON.stringify(status)}`
    );
  }

  async updateRegisterEntryBalances(
    calculatedEntries: CacheRegisterEntry[]
  ): Promise<void> {
    forecastLogger.info(
      `[DataPersisterService] Starting balance update for ${calculatedEntries.length} register entries`
    );

    // Only update entries that definitely exist in the database:
    // - isPending entries (from Plaid sync)
    // - isManualEntry entries (user-created)
    // - isProjected entries that have been converted to pending
    const entriesToUpdate = calculatedEntries.filter(
      (entry) =>
        entry.isPending ||
        entry.isManualEntry ||
        (entry.isProjected && entry.isCleared === false)
    );

    forecastLogger.info(
      `[DataPersisterService] Found ${entriesToUpdate.length} entries to update balances for`
    );

    if (entriesToUpdate.length === 0) {
      forecastLogger.info(
        `[DataPersisterService] No entries to update balances for`
      );
      return;
    }

    // Group entries by account register ID for batch processing
    const entriesByAccount = entriesToUpdate.reduce((acc, entry) => {
      if (!acc[entry.accountRegisterId]) {
        acc[entry.accountRegisterId] = [];
      }
      acc[entry.accountRegisterId].push(entry);
      return acc;
    }, {} as Record<number, CacheRegisterEntry[]>);

    // Process each account's entries
    for (const [accountRegisterId, entries] of Object.entries(
      entriesByAccount
    )) {
      forecastLogger.info(
        `[DataPersisterService] Updating balances for account register ${accountRegisterId} with ${entries.length} entries`
      );

      // Sort entries by date and amount for proper balance calculation
      const sortedEntries = entries.sort((a, b) => {
        const dateA = dateTimeService.toDate(a.createdAt);
        const dateB = dateTimeService.toDate(b.createdAt);
        const timeDiff = dateA.getTime() - dateB.getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.amount - a.amount; // Descending by amount for same date
      });

      // Calculate running balances
      let runningBalance = 0;
      const updateOperations = sortedEntries.map((entry) => {
        runningBalance += entry.amount;
        return () =>
          this.db.registerEntry.update({
            where: { id: entry.id },
            data: { balance: runningBalance },
          });
      });

      // Verify entries exist before updating
      const existingEntryIds = await this.db.registerEntry.findMany({
        where: {
          id: { in: sortedEntries.map((entry) => entry.id) },
        },
        select: { id: true },
      });

      const existingIds = new Set(existingEntryIds.map((entry) => entry.id));
      const validUpdateOperations = updateOperations.filter((_, index) =>
        existingIds.has(sortedEntries[index].id)
      );

      if (validUpdateOperations.length !== updateOperations.length) {
        forecastLogger.warn(
          `[DataPersisterService] Skipping ${
            updateOperations.length - validUpdateOperations.length
          } entries that don't exist in database`
        );
      }

      await this.rateLimiter.executeWithLimit(validUpdateOperations);
    }

    const status = this.rateLimiter.getStatus();
    forecastLogger.debug(
      `[DataPersisterService] Updated balances for ${
        entriesToUpdate.length
      } entries. Rate limiter status: ${JSON.stringify(status)}`
    );
  }

  async convertOldProjectedToPending(accountId?: string): Promise<void> {
    const now = dateTimeService.toDateFromInput(dateTimeService.now());
    forecastLogger.info(
      `[DataPersisterService] Current date for conversion: ${dateTimeService.formatDate(
        now,
        "YYYY-MM-DD"
      )}`
    );

    // Convert old projected entries to pending
    const updateResult = await this.db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        ...(accountId && { register: { accountId } }),
        isProjected: true,
        isCleared: false,
        isManualEntry: false,
        createdAt: { lte: now },
      },
    });

    forecastLogger.info(
      `[DataPersisterService] Converted ${
        updateResult?.count || 0
      } projected entries to pending`
    );

    // Convert old manual entries to pending
    const manualUpdateResult = await this.db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        ...(accountId && { register: { accountId } }),
        isManualEntry: true,
        isCleared: false,
        createdAt: { lte: now },
      },
    });

    forecastLogger.info(
      `[DataPersisterService] Converted ${
        manualUpdateResult?.count || 0
      } manual entries to pending`
    );
  }

  async cleanupProjectedEntries(accountId?: string): Promise<void> {
    await this.db.registerEntry.deleteMany({
      where: {
        ...(accountId && { register: { accountId } }),
        isProjected: true,
        isPending: false,
        isManualEntry: false,
      },
    });
  }

  async cleanupZeroBalanceEntries(accountId?: string): Promise<void> {
    await this.db.registerEntry.deleteMany({
      where: {
        ...(accountId && { register: { accountId } }),
        description: "Latest Balance",
        amount: 0,
        isProjected: false,
      },
    });
  }

  async updateEntryStatuses(accountId?: string): Promise<void> {
    const now = dateTimeService.toDateFromInput(
      dateTimeService.setDateUnits(dateTimeService.now(), {
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
        ...(accountId && { register: { accountId } }),
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { lte: now },
      },
    });

    await this.db.registerEntry.updateMany({
      data: { isPending: false },
      where: {
        ...(accountId && { register: { accountId } }),
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
        ...(accountId && { register: { accountId } }),
        isCleared: false,
        isManualEntry: true,
        createdAt: { lte: now },
      },
    });

    await this.db.registerEntry.updateMany({
      data: { isPending: false },
      where: {
        ...(accountId && { register: { accountId } }),
        isManualEntry: true,
        isCleared: false,
        createdAt: { gt: now },
      },
    });
  }

  async cleanupProjectedEntriesByAccount(accountId: number): Promise<void> {
    await this.db.registerEntry.deleteMany({
      where: {
        accountRegisterId: accountId,
        isProjected: true,
        isManualEntry: false,
      },
    });
  }

  async performInitialCleanup(accountId?: string): Promise<void> {
    forecastLogger.info(
      `[DataPersisterService] Performing initial cleanup for account: ${
        accountId || "all"
      }`
    );

    // Convert old projected entries to pending
    await this.convertOldProjectedToPending(accountId);

    // Clean up old projected entries that are still pending
    await this.cleanupProjectedEntries(accountId);

    // Clean up zero balance entries
    if (accountId) {
      // Get account register IDs for this account
      const accountRegisters = await this.db.accountRegister.findMany({
        where: { accountId },
        select: { id: true },
      });

      const accountRegisterIds = accountRegisters.map((reg) => reg.id);

      await this.db.registerEntry.deleteMany({
        where: {
          description: "Latest Balance",
          accountRegisterId: { in: accountRegisterIds },
        },
      });
    } else {
      await this.cleanupZeroBalanceEntries(accountId);
    }

    forecastLogger.info(
      `[DataPersisterService] Initial cleanup completed for account: ${
        accountId || "all"
      }`
    );
  }

  async performFinalCleanup(accountId?: string): Promise<void> {
    forecastLogger.info(
      `[DataPersisterService] Performing final cleanup for account: ${
        accountId || "all"
      }`
    );

    // Update entry statuses based on current date
    await this.updateEntryStatuses(accountId);

    forecastLogger.info(
      `[DataPersisterService] Final cleanup completed for account: ${
        accountId || "all"
      }`
    );
  }

  async getResultsCount(accountId?: string): Promise<{
    projected: number;
    pending: number;
    manual: number;
    balance: number;
  }> {
    const [projected, pending, manual, balance] = await Promise.all([
      this.db.registerEntry.count({
        where: {
          ...(accountId && { register: { accountId } }),
          isProjected: true,
          isPending: false,
          isManualEntry: false,
        },
      }),
      this.db.registerEntry.count({
        where: {
          ...(accountId && { register: { accountId } }),
          isPending: true,
        },
      }),
      this.db.registerEntry.count({
        where: {
          ...(accountId && { register: { accountId } }),
          isManualEntry: true,
        },
      }),
      this.db.registerEntry.count({
        where: {
          ...(accountId && { register: { accountId } }),
          description: "Latest Balance",
        },
      }),
    ]);

    return {
      projected,
      pending,
      manual,
      balance,
    };
  }
}
