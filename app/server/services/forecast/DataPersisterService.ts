import prismaPkg from "@prisma/client";
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
import { calculateNextOccurrenceDate } from "./reoccurrenceIntervals";

const { Prisma } = prismaPkg;

function persisterBudgetField(
  budgetId?: number | null,
): { budgetId: number } | Record<string, never> {
  if (budgetId === undefined || budgetId === null) {
    return {};
  }
  return { budgetId };
}

function persisterRegisterWhere(
  accountId: string,
  budgetId?: number | null,
) {
  return {
    register: {
      accountId,
      ...persisterBudgetField(budgetId),
    },
  };
}

export class DataPersisterService implements IDataPersisterService {
  private readonly rateLimiter: DatabaseRateLimiter;
  private readonly db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
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
      if (candidateFromExisting) {
        const takeCandidate =
          finalLastAt === null ||
          dateTimeService.isAfter(
            dateTimeService.createUTC(candidateFromExisting),
            dateTimeService.createUTC(finalLastAt),
          );
        if (takeCandidate) {
          finalLastAt = candidateFromExisting;
        }
      }
      if (proposedPastRunAt) {
        const takeProposed =
          finalLastAt === null ||
          dateTimeService.isAfter(
            dateTimeService.createUTC(proposedPastRunAt),
            dateTimeService.createUTC(finalLastAt),
          );
        if (takeProposed) {
          finalLastAt = proposedPastRunAt;
        }
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

    await db.$executeRaw(
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
    if (existingLastAt === null) {
      return null;
    }
    let lastRun = dateTimeService.toDate(existingLastAt);
    let nextRun = calculateNextOccurrenceDate({
      lastAt: lastRun,
      intervalId,
      intervalCount,
      intervalName,
    });
    let guard = 0;
    while (
      nextRun &&
      dateTimeService.isSameOrBefore(dateTimeService.createUTC(nextRun), nowMoment)
    ) {
      lastRun = nextRun;
      nextRun = calculateNextOccurrenceDate({
        lastAt: lastRun,
        intervalId,
        intervalCount,
        intervalName,
      });
      guard += 1;
      if (guard > 2000) break;
    }
    return lastRun;
  }

  async persistForecastResults(
    results: CacheRegisterEntry[],
    tx?: ForecastTransactionClient
  ): Promise<Map<string, string>> {
    const db = this.client(tx);
    const idMap = new Map<string, string>();
    const insertData = results.map((item) => {
      const newId = item.isBalanceEntry ? item.id : createId();
      if (item.isBalanceEntry !== true) {
        idMap.set(item.id, newId);
      }
      return {
        ...item,
        createdAt: dateTimeService
          .createUTC(item.createdAt)
          .toDate()
          .toISOString(),
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
        // Errors are intentionally not rethrown (per-row create handles duplicates); consider logging err in non-test env for FK/bulk failures.
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

    await db.$executeRaw(
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

    await db.$executeRaw(
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
    if (calculatedEntries.length === 0) return;

    // Persist running balances for every row in the forecast result. Projected inserts/reordering
    // change cumulative balances for earlier non-projected lines too; updating only a subset left
    // those rows stale in the DB.
    const idBalancePairs: { id: string; balance: number }[] =
      calculatedEntries.map((entry) => ({
        id: entry.id,
        balance: Number(entry.balance),
      }));

    const db = this.client(tx);
    const caseParts = idBalancePairs.map(
      (p) => Prisma.sql`WHEN ${p.id} THEN ${p.balance}`
    );
    const idList = idBalancePairs.map((p) => Prisma.sql`${p.id}`);

    await db.$executeRaw(
      Prisma.sql`UPDATE register_entry SET balance = CASE id ${Prisma.join(caseParts, " ")} END WHERE id IN (${Prisma.join(idList)})`
    );

    forecastLogger.info(
      `[DataPersisterService] Updated balance for ${idBalancePairs.length} register entries (bulk)`
    );
  }

  async autoApplyPastPocketEntries(
    pocketRegisterIds: number[],
    tx?: ForecastTransactionClient,
  ): Promise<void> {
    if (pocketRegisterIds.length === 0) return;

    const db = this.client(tx);
    const now = dateTimeService.toDate(dateTimeService.now());

    const pocketWhere = {
      accountRegisterId: { in: pocketRegisterIds },
      createdAt: { lte: now },
      isCleared: false,
      isBalanceEntry: false,
    };

    const pocketSums = await db.registerEntry.groupBy({
      by: ["accountRegisterId"],
      where: pocketWhere,
      _sum: { amount: true },
    });

    if (pocketSums.length > 0) {
      await db.registerEntry.updateMany({
        where: pocketWhere,
        data: {
          isCleared: true,
          isProjected: false,
          isPending: false,
          hasBalanceReCalc: true,
        },
      });

      for (const row of pocketSums) {
        const delta = Number(row._sum.amount ?? 0);
        if (delta === 0) continue;
        await db.accountRegister.update({
          where: { id: row.accountRegisterId },
          data: {
            balance: { increment: delta },
            latestBalance: { increment: delta },
          },
        });
      }
    }

    const transferWhere = {
      sourceAccountRegisterId: { in: pocketRegisterIds },
      accountRegisterId: { notIn: pocketRegisterIds },
      createdAt: { lte: now },
      isCleared: false,
      isBalanceEntry: false,
    };

    const transferSums = await db.registerEntry.groupBy({
      by: ["accountRegisterId"],
      where: transferWhere,
      _sum: { amount: true },
    });

    if (transferSums.length > 0) {
      await db.registerEntry.updateMany({
        where: transferWhere,
        data: {
          isCleared: true,
          isProjected: false,
          isPending: false,
          hasBalanceReCalc: true,
        },
      });

      for (const row of transferSums) {
        const delta = Number(row._sum.amount ?? 0);
        if (delta === 0) continue;
        await db.accountRegister.update({
          where: { id: row.accountRegisterId },
          data: {
            balance: { increment: delta },
            latestBalance: { increment: delta },
          },
        });
      }
    }

    forecastLogger.info(
      `[DataPersisterService] autoApplyPastPocketEntries: pockets=${pocketSums.length} register(s), transfer partners=${transferSums.length} register(s)`
    );
  }

  async convertOldProjectedToPending(
    accountId?: string,
    tx?: ForecastTransactionClient,
    budgetId?: number,
  ): Promise<void> {
    const db = this.client(tx);
    const now = dateTimeService.toDate(dateTimeService.now());
    forecastLogger.info(
      `[DataPersisterService] Current date for conversion: ${dateTimeService.format(
        "YYYY-MM-DD",
        now,
      )}`,
    );

    const registerScope =
      accountId === undefined || accountId === null
        ? {}
        : persisterRegisterWhere(accountId, budgetId);

    const updateResult = await db.registerEntry.updateMany({
      data: { isPending: true },
      where: {
        ...registerScope,
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
        ...registerScope,
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
    tx?: ForecastTransactionClient,
    budgetId?: number,
  ): Promise<void> {
    const db = this.client(tx);
    await db.registerEntry.deleteMany({
      where: {
        ...(accountId === undefined || accountId === null
          ? {}
          : persisterRegisterWhere(accountId, budgetId)),
        isProjected: true,
        isPending: false,
        isManualEntry: false,
      },
    });
  }

  private async cleanupZeroBalanceEntries(
    accountId?: string,
    tx?: ForecastTransactionClient,
    budgetId?: number,
  ): Promise<void> {
    const db = this.client(tx);
    await db.registerEntry.deleteMany({
      where: {
        ...(accountId === undefined || accountId === null
          ? {}
          : persisterRegisterWhere(accountId, budgetId)),
        isBalanceEntry: true,
        amount: 0,
        isProjected: false,
      },
    });
  }

  async updateEntryStatuses(
    accountId?: string,
    tx?: ForecastTransactionClient,
    budgetId?: number,
  ): Promise<void> {
    const db = this.client(tx);
    const now = dateTimeService.toDate(
      dateTimeService.set(
        {
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        },
        dateTimeService.now(),
      ),
    );

    if (accountId === undefined || accountId === null) {
      const accountRows = await db.accountRegister.findMany({
        select: { accountId: true },
        distinct: ["accountId"],
      });
      for (const { accountId: id } of accountRows) {
        await db.$executeRaw(
          Prisma.sql`UPDATE register_entry re INNER JOIN account_register ar ON re.account_register_id = ar.id SET re.is_pending = (re.created_at <= ${now}) WHERE re.is_cleared = 0 AND (re.is_projected = 1 OR re.is_manual_entry = 1) AND ar.account_id = ${id}`,
        );
      }
      return;
    }

    if (budgetId === undefined || budgetId === null) {
      await db.$executeRaw(
        Prisma.sql`UPDATE register_entry re INNER JOIN account_register ar ON re.account_register_id = ar.id SET re.is_pending = (re.created_at <= ${now}) WHERE re.is_cleared = 0 AND (re.is_projected = 1 OR re.is_manual_entry = 1) AND ar.account_id = ${accountId}`,
      );
      return;
    }

    await db.$executeRaw(
      Prisma.sql`UPDATE register_entry re INNER JOIN account_register ar ON re.account_register_id = ar.id SET re.is_pending = (re.created_at <= ${now}) WHERE re.is_cleared = 0 AND (re.is_projected = 1 OR re.is_manual_entry = 1) AND ar.account_id = ${accountId} AND ar.budget_id = ${budgetId}`,
    );
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
    accountRegisterIds?: number[],
    budgetId?: number,
  ): Promise<void> {
    const db = this.client(tx);
    forecastLogger.info(
      `[DataPersisterService] Performing initial cleanup for account: ${
        accountId || "all"
      }`
    );

    await this.convertOldProjectedToPending(accountId, tx, budgetId);
    await this.cleanupProjectedEntries(accountId, tx, budgetId);

    if (accountId) {
      const ids =
        accountRegisterIds ??
        (
          await db.accountRegister.findMany({
            where: {
              accountId,
              ...persisterBudgetField(budgetId),
            },
            select: { id: true },
          })
        ).map((reg) => reg.id);

      if (ids.length > 0) {
        await db.registerEntry.deleteMany({
          where: {
            isBalanceEntry: true,
            accountRegisterId: { in: ids },
          },
        });
      }
    } else {
      await this.cleanupZeroBalanceEntries(accountId, tx, budgetId);
    }

    forecastLogger.info(
      `[DataPersisterService] Initial cleanup completed for account: ${
        accountId || "all"
      }`
    );
  }

  async performFinalCleanup(
    accountId?: string,
    tx?: ForecastTransactionClient,
    budgetId?: number,
  ): Promise<void> {
    forecastLogger.info(
      `[DataPersisterService] Performing final cleanup for account: ${
        accountId || "all"
      }`
    );

    await this.updateEntryStatuses(accountId, tx, budgetId);

    forecastLogger.info(
      `[DataPersisterService] Final cleanup completed for account: ${
        accountId || "all"
      }`
    );
  }

  async getResultsCount(
    accountId?: string,
    budgetId?: number,
  ): Promise<{
    projected: number;
    pending: number;
    manual: number;
    balance: number;
  }> {
    const registerFilter =
      accountId === undefined || accountId === null
        ? {}
        : persisterRegisterWhere(accountId, budgetId);
    const [projected, pending, manual, balance] = await Promise.all([
      this.db.registerEntry.count({
        where: {
          ...registerFilter,
          isProjected: true,
          isPending: false,
          isManualEntry: false,
        },
      }),
      this.db.registerEntry.count({
        where: {
          ...registerFilter,
          isPending: true,
        },
      }),
      this.db.registerEntry.count({
        where: {
          ...registerFilter,
          isManualEntry: true,
        },
      }),
      this.db.registerEntry.count({
        where: {
          ...registerFilter,
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
