import moment from "moment";
import type { PrismaClient } from "@prisma/client";
import type { IDataPersisterService } from "./types";
import type { CacheRegisterEntry } from "./ModernCacheService";
import { createId } from "@paralleldrive/cuid2";
import { DatabaseRateLimiter } from "./lib/rateLimiter";

export class DataPersisterService implements IDataPersisterService {
  private rateLimiter: DatabaseRateLimiter;

  constructor(private db: PrismaClient) {
    // Limit to 3 concurrent database operations for recalculate
    this.rateLimiter = new DatabaseRateLimiter(3);
  }

  async persistForecastResults(results: CacheRegisterEntry[]): Promise<void> {
    // Generate new IDs for all forecast entries to avoid conflicts, except for balance entries
    const insertData = results.map((item) => ({
      ...item,
      createdAt: moment(item.createdAt).utc().toISOString(),
      id: item.isBalanceEntry ? item.id : createId(), // Preserve original IDs for balance entries
    }));

    // Use createMany for better performance, fallback to individual creates if needed
    try {
      await this.db.registerEntry.createMany({
        data: insertData,
        skipDuplicates: true,
      });
    } catch (error) {
      // Fallback to individual creates if createMany fails
      console.log(
        `[DataPersisterService] Using rate-limited fallback for ${insertData.length} entries`
      );

      const operations = insertData.map(
        (item) => () =>
          this.db.registerEntry
            .create({
              data: item,
            })
            .catch(() => {
              // Ignore duplicate key errors
              console.log(
                `[DataPersisterService] Skipped duplicate entry: ${item.id}`
              );
            })
      );

      await this.rateLimiter.executeWithLimit(operations);

      const status = this.rateLimiter.getStatus();
      console.log(
        `[DataPersisterService] Rate limiter status: ${JSON.stringify(status)}`
      );
    }
  }

  async updateAccountRegisterBalances(accountId: string): Promise<void> {
    // Get all account registers for this account
    const accountRegisters = await this.db.accountRegister.findMany({
      where: { accountId },
      select: { id: true, balance: true, latestBalance: true },
    });

    // Update the latestBalance field to match the current balance
    // This ensures that future recalculations will use the current balance as the opening balance
    console.log(
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
    console.log(
      `[DataPersisterService] Updated latestBalance for ${
        accountRegisters.length
      } account registers. Rate limiter status: ${JSON.stringify(status)}`
    );
  }

  async updateRegisterEntryBalances(
    calculatedEntries: CacheRegisterEntry[]
  ): Promise<void> {
    console.log(
      `[DataPersisterService] Starting balance update for ${calculatedEntries.length} register entries`
    );

    // Only update entries that definitely exist in the database:
    // - isPending entries (from Plaid sync)
    // - isManualEntry entries (user-created)
    // Do NOT update:
    // - isProjected entries (they get persisted separately)
    // - isBalanceEntry entries (they're created fresh each time)
    const existingEntries = calculatedEntries.filter(
      (entry) =>
        (entry.isPending || entry.isManualEntry) && !entry.isBalanceEntry
    );

    console.log(
      `[DataPersisterService] Filtered to ${
        existingEntries.length
      } existing entries to update (isPending: ${
        existingEntries.filter((e) => e.isPending).length
      }, isManualEntry: ${
        existingEntries.filter((e) => e.isManualEntry).length
      })`
    );

    if (existingEntries.length === 0) {
      console.log(`[DataPersisterService] No existing entries to update`);
      return;
    }

    // Verify which entries actually exist in the database
    console.log(
      `[DataPersisterService] Verifying ${existingEntries.length} entries exist in database...`
    );
    const entryIds = existingEntries.map((e) => e.id);
    const dbEntries = await this.db.registerEntry.findMany({
      where: { id: { in: entryIds } },
      select: { id: true },
    });

    const existingDbIds = new Set(dbEntries.map((e) => e.id));
    const validEntries = existingEntries.filter((entry) =>
      existingDbIds.has(entry.id)
    );

    console.log(
      `[DataPersisterService] Found ${validEntries.length} entries that actually exist in database (out of ${existingEntries.length} attempted)`
    );

    if (validEntries.length === 0) {
      console.log(`[DataPersisterService] No valid entries to update`);
      return;
    }

    // Group entries by account register for batch processing
    const entriesByAccount = validEntries.reduce((acc, entry) => {
      if (!acc[entry.accountRegisterId]) {
        acc[entry.accountRegisterId] = [];
      }
      acc[entry.accountRegisterId].push(entry);
      return acc;
    }, {} as Record<number, CacheRegisterEntry[]>);

    console.log(
      `[DataPersisterService] Processing ${
        Object.keys(entriesByAccount).length
      } accounts`
    );

    // Process each account's entries
    for (const [accountRegisterId, entries] of Object.entries(
      entriesByAccount
    )) {
      console.log(
        `[DataPersisterService] Processing ${entries.length} entries for account ${accountRegisterId}`
      );

      const updateOperations = entries.map(
        (entry) => () =>
          this.db.registerEntry
            .update({
              where: { id: entry.id },
              data: {
                balance: entry.balance,
                hasBalanceReCalc: true,
              },
            })
            .catch((error) => {
              console.log(
                `[DataPersisterService] Failed to update balance for entry ${entry.id}:`,
                error
              );
            })
      );

      console.log(
        `[DataPersisterService] Starting rate-limited updates for account ${accountRegisterId}`
      );
      await this.rateLimiter.executeWithLimit(updateOperations);
      console.log(
        `[DataPersisterService] Completed updates for account ${accountRegisterId}`
      );
    }

    const status = this.rateLimiter.getStatus();
    console.log(
      `[DataPersisterService] Updated balance columns for ${
        validEntries.length
      } entries. Rate limiter status: ${JSON.stringify(status)}`
    );
  }

  /**
   * Converts old projected entries to pending entries before cleanup
   * This ensures that projected entries older than current date are preserved as pending
   */
  async convertOldProjectedToPending(accountId?: string): Promise<void> {
    const now = moment()
      .utc()
      .set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      })
      .toDate();

    console.log(
      `[DataPersisterService] Converting old projected entries to pending for accountId: ${accountId}`
    );
    console.log(
      `[DataPersisterService] Current date for conversion: ${moment(now).format(
        "YYYY-MM-DD"
      )}`
    );

    // First, let's see how many old projected entries exist
    const oldProjectedCount = await this.db.registerEntry.count({
      where: {
        register: { accountId },
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { lte: now },
      },
    });

    console.log(
      `[DataPersisterService] Found ${oldProjectedCount} old projected entries to convert`
    );

    if (oldProjectedCount === 0) {
      console.log(`[DataPersisterService] No old projected entries to convert`);
      return;
    }

    // Convert old projected entries to pending (isProjected=false, isPending=true)
    const result = await this.db.registerEntry.updateMany({
      data: {
        isProjected: false,
        isPending: true,
      },
      where: {
        register: { accountId },
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { lte: now },
      },
    });

    console.log(
      `[DataPersisterService] Successfully converted ${result.count} old projected entries to pending entries`
    );

    // Verify the conversion worked
    const pendingCount = await this.db.registerEntry.count({
      where: {
        register: { accountId },
        isCleared: false,
        isProjected: false,
        isPending: true,
        isManualEntry: false,
        createdAt: { lte: now },
      },
    });

    console.log(
      `[DataPersisterService] Verification: ${pendingCount} pending entries now exist (should be >= ${result.count})`
    );
  }

  async cleanupProjectedEntries(accountId?: string): Promise<void> {
    await this.db.registerEntry.deleteMany({
      where: {
        register: { accountId },
        isProjected: true,
        isManualEntry: false,
      },
    });
  }

  async cleanupZeroBalanceEntries(): Promise<void> {
    await this.db.registerEntry.deleteMany({
      where: {
        description: "Latest Balance",
        isBalanceEntry: false, // Don't delete actual balance entries
      },
    });
  }

  async updateEntryStatuses(accountId?: string): Promise<void> {
    const now = moment()
      .utc()
      .set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      })
      .toDate();

    // Only projected entries that are past due should be marked as pending
    await this.db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        register: { accountId },
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { lte: now },
      },
    });

    // Projected entries that are future should be marked as not pending
    await this.db.registerEntry.updateMany({
      data: { isPending: false },
      where: {
        register: { accountId },
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { gt: now },
      },
    });

    // Manual entries that are past due should be marked as pending
    await this.db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        register: { accountId },
        isCleared: false,
        isManualEntry: true,
        createdAt: { lte: now },
      },
    });

    // Manual entries that are future should be marked as not pending
    await this.db.registerEntry.updateMany({
      data: { isPending: false },
      where: {
        register: { accountId },
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

  /**
   * Performs all database cleanup operations before starting new forecast
   */
  async performInitialCleanup(accountId?: string): Promise<void> {
    console.log(
      "[DataPersisterService] Starting initial cleanup for accountId:",
      accountId
    );

    // Clean up balance entries for this specific account only
    let balanceResult = { count: 0 };
    if (accountId) {
      const accountRegisters = await this.db.accountRegister.findMany({
        where: { accountId },
        select: { id: true },
      });
      const accountRegisterIds = accountRegisters.map((r) => r.id);

      balanceResult = await this.db.registerEntry.deleteMany({
        where: {
          isBalanceEntry: true,
          accountRegisterId: { in: accountRegisterIds },
        },
      });
    }
    console.log(
      "[DataPersisterService] Cleaned up balance entries:",
      balanceResult
    );

    await Promise.all([
      this.cleanupProjectedEntries(accountId),
      this.cleanupZeroBalanceEntries(),
    ]);

    console.log("[DataPersisterService] Completed initial cleanup");
  }

  /**
   * Performs final database operations after forecast completion
   */
  async performFinalCleanup(accountId?: string): Promise<void> {
    await Promise.all([this.cleanupZeroBalanceEntries()]);
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
          register: { accountId },
          isProjected: true,
          isCleared: false,
        },
      }),
      this.db.registerEntry.count({
        where: {
          register: { accountId },
          isPending: true,
          isCleared: false,
        },
      }),
      this.db.registerEntry.count({
        where: {
          register: { accountId },
          isManualEntry: true,
          isCleared: false,
        },
      }),
      this.db.registerEntry.count({
        where: {
          register: { accountId },
          isBalanceEntry: true,
        },
      }),
    ]);

    return { projected, pending, manual, balance };
  }
}
