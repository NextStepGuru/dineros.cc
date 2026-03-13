import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  IDataPersisterService,
  ForecastTransactionClient,
} from "./types";
import type {
  CacheRegisterEntry,
  CacheReoccurrence,
  CacheAccountRegister,
} from "./ModernCacheService";
import { createId } from "@paralleldrive/cuid2";
import { DatabaseRateLimiter } from "./lib/rateLimiter";
import { dateTimeService } from "./DateTimeService";
import { forecastLogger } from "./logger";

export class DataPersisterService implements IDataPersisterService {
  private rateLimiter: DatabaseRateLimiter;

  constructor(private db: PrismaClient) {
    this.rateLimiter = new DatabaseRateLimiter(3);
  }

  private client(tx?: ForecastTransactionClient): PrismaClient {
    return (tx ?? this.db) as PrismaClient;
  }

  async persistReoccurrenceLastAt(
    reoccurrences: CacheReoccurrence[],
    tx?: ForecastTransactionClient
  ): Promise<void> {
    if (reoccurrences.length === 0) return;

    const db = this.client(tx);
    const nowDate = dateTimeService.nowDate();
    const nowMoment = dateTimeService.createUTC(nowDate);

    const rows = reoccurrences.map((item) => ({
      id: item.id,
      lastAt: this.computeLastRunAtToPersist(item, nowMoment),
      updatedAt: item.updatedAt ?? nowDate,
    }));

    const lastAtCases = rows.map((r) =>
      Prisma.sql`WHEN ${r.id} THEN ${r.lastAt}`
    );
    const updatedAtCases = rows.map((r) =>
      Prisma.sql`WHEN ${r.id} THEN ${r.updatedAt}`
    );
    const idList = rows.map((r) => Prisma.sql`${r.id}`);

    await (db as PrismaClient).$executeRaw(
      Prisma.sql`UPDATE reoccurrence SET last_at = CASE id ${Prisma.join(lastAtCases, " ")} END, updated_at = CASE id ${Prisma.join(updatedAtCases, " ")} END WHERE id IN (${Prisma.join(idList)})`
    );
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
    results: CacheRegisterEntry[],
    tx?: ForecastTransactionClient
  ): Promise<Map<string, string>> {
    const db = this.client(tx);
    const idMap = new Map<string, string>();
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

    try {
      await db.registerEntry.createMany({
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
          db.registerEntry
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

  async updateAccountRegisterBalances(
    accountRegisters: CacheAccountRegister[],
    tx?: ForecastTransactionClient
  ): Promise<void> {
    if (accountRegisters.length === 0) return;

    const db = this.client(tx);
    const caseParts = accountRegisters.map(
      (r) => Prisma.sql`WHEN ${r.id} THEN ${Number(r.balance)}`
    );
    const idList = accountRegisters.map((r) => Prisma.sql`${r.id}`);

    await (db as PrismaClient).$executeRaw(
      Prisma.sql`UPDATE account_register SET latest_balance = CASE id ${Prisma.join(caseParts, " ")} END WHERE id IN (${Prisma.join(idList)})`
    );

    forecastLogger.info(
      `[DataPersisterService] Updated latest_balance for ${accountRegisters.length} account registers (bulk)`
    );
  }

  async batchUpdateStatementDates(
    updates: { id: number; statementAt: Date }[],
    tx?: ForecastTransactionClient
  ): Promise<void> {
    if (updates.length === 0) return;

    const db = this.client(tx);
    const caseParts = updates.map(
      (u) => Prisma.sql`WHEN ${u.id} THEN ${u.statementAt}`
    );
    const idList = updates.map((u) => Prisma.sql`${u.id}`);

    await (db as PrismaClient).$executeRaw(
      Prisma.sql`UPDATE account_register SET statement_at = CASE id ${Prisma.join(caseParts, " ")} END WHERE id IN (${Prisma.join(idList)})`
    );

    forecastLogger.info(
      `[DataPersisterService] Updated statement_at for ${updates.length} account registers (bulk)`
    );
  }

  async updateRegisterEntryBalances(
    calculatedEntries: CacheRegisterEntry[],
    tx?: ForecastTransactionClient
  ): Promise<void> {
    const entriesToUpdate = calculatedEntries.filter(
      (entry) =>
        entry.isPending ||
        entry.isManualEntry ||
        (entry.isProjected && entry.isCleared === false)
    );

    if (entriesToUpdate.length === 0) return;

    const entriesByAccount = entriesToUpdate.reduce((acc, entry) => {
      if (!acc[entry.accountRegisterId]) {
        acc[entry.accountRegisterId] = [];
      }
      acc[entry.accountRegisterId].push(entry);
      return acc;
    }, {} as Record<number, CacheRegisterEntry[]>);

    const idBalancePairs: { id: string; balance: number }[] = [];
    for (const entries of Object.values(entriesByAccount)) {
      const sorted = [...entries].sort((a, b) => {
        const dateA = dateTimeService.toDate(a.createdAt);
        const dateB = dateTimeService.toDate(b.createdAt);
        const timeDiff = dateA.getTime() - dateB.getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.amount - a.amount;
      });
      let running = 0;
      for (const entry of sorted) {
        running += entry.amount;
        idBalancePairs.push({ id: entry.id, balance: running });
      }
    }

    const db = this.client(tx);
    const caseParts = idBalancePairs.map(
      (p) => Prisma.sql`WHEN ${p.id} THEN ${p.balance}`
    );
    const idList = idBalancePairs.map((p) => Prisma.sql`${p.id}`);

    await (db as PrismaClient).$executeRaw(
      Prisma.sql`UPDATE register_entry SET balance = CASE id ${Prisma.join(caseParts, " ")} END WHERE id IN (${Prisma.join(idList)})`
    );

    forecastLogger.info(
      `[DataPersisterService] Updated balance for ${idBalancePairs.length} register entries (bulk)`
    );
  }

  async convertOldProjectedToPending(
    accountId?: string,
    tx?: ForecastTransactionClient
  ): Promise<void> {
    const db = this.client(tx);
    const now = dateTimeService.toDateFromInput(dateTimeService.now());
    forecastLogger.info(
      `[DataPersisterService] Current date for conversion: ${dateTimeService.formatDate(
        now,
        "YYYY-MM-DD"
      )}`
    );

    const updateResult = await db.registerEntry.updateMany({
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

    const manualUpdateResult = await db.registerEntry.updateMany({
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

  async cleanupProjectedEntries(
    accountId?: string,
    tx?: ForecastTransactionClient
  ): Promise<void> {
    const db = this.client(tx);
    await db.registerEntry.deleteMany({
      where: {
        ...(accountId && { register: { accountId } }),
        isProjected: true,
        isPending: false,
        isManualEntry: false,
      },
    });
  }

  private async cleanupZeroBalanceEntries(
    accountId?: string,
    tx?: ForecastTransactionClient
  ): Promise<void> {
    const db = this.client(tx);
    await db.registerEntry.deleteMany({
      where: {
        ...(accountId && { register: { accountId } }),
        description: "Latest Balance",
        amount: 0,
        isProjected: false,
      },
    });
  }

  async updateEntryStatuses(
    accountId?: string,
    tx?: ForecastTransactionClient
  ): Promise<void> {
    const db = this.client(tx);
    const now = dateTimeService.toDateFromInput(
      dateTimeService.setDateUnits(dateTimeService.now(), {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      })
    );

    await db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        ...(accountId && { register: { accountId } }),
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { lte: now },
      },
    });

    await db.registerEntry.updateMany({
      data: { isPending: false },
      where: {
        ...(accountId && { register: { accountId } }),
        isCleared: false,
        isProjected: true,
        isManualEntry: false,
        createdAt: { gt: now },
      },
    });

    await db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        ...(accountId && { register: { accountId } }),
        isCleared: false,
        isManualEntry: true,
        createdAt: { lte: now },
      },
    });

    await db.registerEntry.updateMany({
      data: { isPending: false },
      where: {
        ...(accountId && { register: { accountId } }),
        isManualEntry: true,
        isCleared: false,
        createdAt: { gt: now },
      },
    });
  }

  async cleanupProjectedEntriesByAccount(
    accountId: number,
    tx?: ForecastTransactionClient
  ): Promise<void> {
    const db = this.client(tx);
    await db.registerEntry.deleteMany({
      where: {
        accountRegisterId: accountId,
        isProjected: true,
        isManualEntry: false,
      },
    });
  }

  async performInitialCleanup(
    accountId?: string,
    tx?: ForecastTransactionClient,
    accountRegisterIds?: number[]
  ): Promise<void> {
    const db = this.client(tx);
    forecastLogger.info(
      `[DataPersisterService] Performing initial cleanup for account: ${
        accountId || "all"
      }`
    );

    await this.convertOldProjectedToPending(accountId, tx);
    await this.cleanupProjectedEntries(accountId, tx);

    if (accountId) {
      const ids =
        accountRegisterIds ??
        (await db.accountRegister.findMany({
          where: { accountId },
          select: { id: true },
        })).map((reg) => reg.id);

      if (ids.length > 0) {
        await db.registerEntry.deleteMany({
          where: {
            description: "Latest Balance",
            accountRegisterId: { in: ids },
          },
        });
      }
    } else {
      await this.cleanupZeroBalanceEntries(accountId, tx);
    }

    forecastLogger.info(
      `[DataPersisterService] Initial cleanup completed for account: ${
        accountId || "all"
      }`
    );
  }

  async performFinalCleanup(
    accountId?: string,
    tx?: ForecastTransactionClient
  ): Promise<void> {
    forecastLogger.info(
      `[DataPersisterService] Performing final cleanup for account: ${
        accountId || "all"
      }`
    );

    await this.updateEntryStatuses(accountId, tx);

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
