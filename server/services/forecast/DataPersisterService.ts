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
    const existingRows = await db.reoccurrence.findMany({
      where: { id: { in: reoccurrences.map((r) => r.id) } },
      select: { id: true, lastAt: true },
    });
    const existingById = new Map<number, Date | null>(
      existingRows.map((r) => [r.id, r.lastAt ?? null])
    );

    const rows = reoccurrences.map((item) => ({
      id: item.id,
      description: item.description,
      intervalId: item.intervalId,
      intervalCount: item.intervalCount || 1,
      intervalName: item.intervalName,
      proposedLastRunAt: item.lastRunAt ?? null,
      existingLastAt: existingById.get(item.id) ?? null,
      updatedAt: item.updatedAt ?? nowDate,
    })).map((row) => {
      const candidateFromExisting = this.computeLatestPastRunFromExisting(
        row.existingLastAt,
        row.intervalId,
        row.intervalCount,
        row.intervalName,
        nowMoment
      );
      const proposedPastRunAt =
        row.proposedLastRunAt &&
        dateTimeService.isSameOrBefore(
          dateTimeService.createUTC(row.proposedLastRunAt),
          nowMoment
        )
          ? row.proposedLastRunAt
          : null;
      let finalLastAt = row.existingLastAt;
      if (
        candidateFromExisting &&
        (!finalLastAt ||
          dateTimeService.isAfter(
            dateTimeService.createUTC(candidateFromExisting),
            dateTimeService.createUTC(finalLastAt)
          ))
      ) {
        finalLastAt = candidateFromExisting;
      }
      if (
        proposedPastRunAt &&
        (!finalLastAt ||
          dateTimeService.isAfter(
            dateTimeService.createUTC(proposedPastRunAt),
            dateTimeService.createUTC(finalLastAt)
          ))
      ) {
        finalLastAt = proposedPastRunAt;
      }
      return {
        id: row.id,
        lastAt: finalLastAt,
        updatedAt: row.updatedAt,
      };
    });

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

  private computeLatestPastRunFromExisting(
    existingLastAt: Date | null,
    intervalId: number,
    intervalCount: number,
    intervalName: string | null | undefined,
    nowMoment: ReturnType<typeof dateTimeService.createUTC>
  ): Date | null {
    if (!existingLastAt) return null;
    const unit = this.getIntervalUnit(intervalId, intervalName);
    if (!unit) return null;
    let lastRun = dateTimeService.createUTC(existingLastAt);
    let nextRun = dateTimeService.add(intervalCount || 1, unit, lastRun);
    while (dateTimeService.isSameOrBefore(nextRun, nowMoment)) {
      lastRun = nextRun;
      nextRun = dateTimeService.add(intervalCount || 1, unit, lastRun);
    }
    return dateTimeService.toDate(lastRun);
  }

  private getIntervalUnit(
    intervalId: number,
    intervalName: string | null | undefined
  ): "days" | "weeks" | "months" | "years" | null {
    const name = intervalName?.trim().toLowerCase();
    if (name === "once") return null;
    if (name === "day" || name === "days") return "days";
    if (name === "week" || name === "weeks") return "weeks";
    if (name === "month" || name === "months") return "months";
    if (name === "year" || name === "years") return "years";
    switch (intervalId) {
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

    const CHUNK_SIZE = 350;
    for (let i = 0; i < insertData.length; i += CHUNK_SIZE) {
      const chunk = insertData.slice(i, i + CHUNK_SIZE);
      try {
        await db.registerEntry.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      } catch {
        forecastLogger.service(
          "DataPersisterService",
          `Using rate-limited fallback for chunk of ${chunk.length} entries`
        );
        const operations = chunk.map(
          (item) => () =>
            db.registerEntry
              .create({
                data: item,
              })
              .catch(() => {
                forecastLogger.service(
                  "DataPersisterService",
                  `Skipped duplicate entry: ${item.id}`
                );
              })
        );
        await this.rateLimiter.executeWithLimit(operations);
      }
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
      let minRunning = Number.POSITIVE_INFINITY;
      let maxRunning = Number.NEGATIVE_INFINITY;
      for (const entry of sorted) {
        running += entry.amount;
        if (running < minRunning) minRunning = running;
        if (running > maxRunning) maxRunning = running;
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
        isBalanceEntry: true,
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

    if (accountId) {
      await (db as PrismaClient).$executeRaw(
        Prisma.sql`UPDATE register_entry re INNER JOIN account_register ar ON re.account_register_id = ar.id SET re.is_pending = (re.created_at <= ${now}) WHERE re.is_cleared = 0 AND (re.is_projected = 1 OR re.is_manual_entry = 1) AND ar.account_id = ${accountId}`
      );
    } else {
      const accountRows = await db.accountRegister.findMany({
        select: { accountId: true },
        distinct: ["accountId"],
      });
      const rows = Array.isArray(accountRows) ? accountRows : [];
      for (const { accountId: id } of rows) {
        await (db as PrismaClient).$executeRaw(
          Prisma.sql`UPDATE register_entry re INNER JOIN account_register ar ON re.account_register_id = ar.id SET re.is_pending = (re.created_at <= ${now}) WHERE re.is_cleared = 0 AND (re.is_projected = 1 OR re.is_manual_entry = 1) AND ar.account_id = ${id}`
        );
      }
    }
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
            isBalanceEntry: true,
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
          isBalanceEntry: true,
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
