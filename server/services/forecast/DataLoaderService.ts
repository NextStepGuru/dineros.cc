import type { PrismaClient } from "@prisma/client";
import type { IDataLoaderService, ForecastContext, AccountData } from "./types";
import type {
  CacheAccountRegister,
  CacheSavingsGoal,
  ModernCacheService,
} from "./ModernCacheService";
import { dateTimeService } from "./DateTimeService";

export class DataLoaderService implements IDataLoaderService {
  private readonly db: PrismaClient;
  private readonly cache: ModernCacheService;

  constructor(db: PrismaClient, cache: ModernCacheService) {
    this.db = db;
    this.cache = cache;
  }

  async loadAccountData(context: ForecastContext): Promise<AccountData> {
    const { accountId, budgetId } = context;
    // Clear existing cache
    this.cache.accountRegister.clear();
    this.cache.registerEntry.clear();
    this.cache.reoccurrence.clear();
    this.cache.reoccurrenceSkip.clear();
    this.cache.reoccurrenceSplit.clear();
    this.cache.savingsGoal.clear();

    const [
      accountRegisters,
      registerEntries,
      reoccurrences,
      reoccurrenceSkips,
      ,
      ,
    ] = await Promise.all([
      this.loadAccountRegisters(accountId, budgetId),
      this.loadRegisterEntries(accountId, budgetId),
      this.loadReoccurrences(accountId, budgetId),
      this.loadReoccurrenceSkips(accountId, budgetId),
      this.loadReoccurrenceSplits(accountId, budgetId),
      this.loadSavingsGoals(accountId, budgetId),
    ]);

    const minReoccurrenceDate = (() => {
      const dates = reoccurrences
        .map((r) => r.lastAt)
        .filter((d): d is NonNullable<typeof d> => d != null);
      if (dates.length === 0) return null;
      const minEpoch = Math.min(
        ...dates.map((d) => dateTimeService.createUTC(d).valueOf()),
      );
      return dateTimeService.fromEpoch(minEpoch).toDate();
    })();

    return {
      accountRegisters,
      registerEntries,
      reoccurrences,
      reoccurrenceSkips,
      minReoccurrenceDate,
    };
  }

  private async loadAccountRegisters(
    accountId?: string,
    budgetId?: number,
  ): Promise<CacheAccountRegister[]> {
    const accountRegisters = await this.db.accountRegister.findMany({
      where: {
        accountId,
        ...(budgetId != null ? { budgetId } : {}),
      },
      select: {
        id: true,
        budgetId: true,
        accountId: true,
        name: true,
        balance: true,
        latestBalance: true,
        minPayment: true,
        statementAt: true,
        statementIntervalId: true,
        apr1: true,
        apr1StartAt: true,
        apr2: true,
        apr2StartAt: true,
        apr3: true,
        apr3StartAt: true,
        targetAccountRegisterId: true,
        loanStartAt: true,
        loanPaymentsPerYear: true,
        loanTotalYears: true,
        loanOriginalAmount: true,
        loanPaymentSortOrder: true,
        savingsGoalSortOrder: true,
        accountSavingsGoal: true,
        minAccountBalance: true,
        allowExtraPayment: true,
        isArchived: true,
        typeId: true,
        plaidId: true,
        depreciationRate: true,
        depreciationMethod: true,
        assetOriginalValue: true,
        assetResidualValue: true,
        assetUsefulLifeYears: true,
        assetStartAt: true,
        paymentCategoryId: true,
        interestCategoryId: true,
        type: {
          select: {
            accruesBalanceGrowth: true,
          },
        },
      },
    });

    const lokiAccountRegisters: CacheAccountRegister[] = accountRegisters.map(
      (reg) => {
        const { type, ...regFields } = reg;
        return {
          ...regFields,
          accruesBalanceGrowth: type?.accruesBalanceGrowth ?? false,
          balance: Number(reg.latestBalance),
          latestBalance: Number(reg.latestBalance),
          minPayment: reg.minPayment ? Number(reg.minPayment) : null,
          apr1: reg.apr1 ? Number(reg.apr1) : null,
          apr2: reg.apr2 ? Number(reg.apr2) : null,
          apr3: reg.apr3 ? Number(reg.apr3) : null,
          loanOriginalAmount: reg.loanOriginalAmount
            ? Number(reg.loanOriginalAmount)
            : null,
          minAccountBalance:
            reg.minAccountBalance == null ? 0 : Number(reg.minAccountBalance),
          accountSavingsGoal: reg.accountSavingsGoal
            ? Number(reg.accountSavingsGoal)
            : null,
          statementAt: dateTimeService.createUTC(reg.statementAt).toDate(),
          depreciationRate: reg.depreciationRate
            ? Number(reg.depreciationRate)
            : null,
          depreciationMethod: reg.depreciationMethod ?? null,
          assetOriginalValue: reg.assetOriginalValue
            ? Number(reg.assetOriginalValue)
            : null,
          assetResidualValue: reg.assetResidualValue
            ? Number(reg.assetResidualValue)
            : null,
          assetUsefulLifeYears: reg.assetUsefulLifeYears ?? null,
          assetStartAt: reg.assetStartAt
            ? dateTimeService.createUTC(reg.assetStartAt).toDate()
            : null,
          paymentCategoryId: reg.paymentCategoryId ?? null,
          interestCategoryId: reg.interestCategoryId ?? null,
        };
      },
    );

    // Load into cache
    lokiAccountRegisters.forEach((accountRegister) => {
      this.cache.accountRegister.insert(accountRegister);
    });

    return lokiAccountRegisters;
  }

  private async loadRegisterEntries(
    accountId?: string,
    budgetId?: number,
  ) {
    const registerEntries = await this.db.registerEntry.findMany({
      where: {
        register: {
          accountId,
          ...(budgetId != null ? { budgetId } : {}),
        },
        isCleared: false, // Exclude cleared entries from active calculations
        OR: [
          // Load all non-projected entries (including historical ones)
          { isProjected: false },
          // Do NOT load balance entries - they should be created fresh by the forecast engine
        ],
      },
      orderBy: [{ createdAt: "asc" }, { amount: "desc" }],
    });

    const cacheEntries = registerEntries.map((entry) => ({
      ...entry,
      amount: Number(entry.amount),
      balance: Number(entry.balance),
      createdAt: dateTimeService.createUTC(entry.createdAt).toDate(),
      categoryId: entry.categoryId ?? null,
    }));

    // Insert into cache (this was missing!)
    cacheEntries.forEach((entry) => {
      this.cache.registerEntry.insert(entry);
    });

    return cacheEntries;
  }

  private async loadReoccurrences(
    accountId?: string,
    budgetId?: number,
  ) {
    const reoccurrences = await this.db.reoccurrence.findMany({
      where: {
        accountId,
        ...(budgetId != null
          ? { register: { budgetId } }
          : {}),
      },
      include: {
        interval: { select: { name: true } },
        amountAdjustmentInterval: { select: { name: true } },
      },
    });

    // Load into cache
    reoccurrences.forEach((item) => {
      const { interval, amountAdjustmentInterval, ...rest } = item;
      this.cache.reoccurrence.insert({
        ...rest,
        amount: Number(item.amount),
        amountAdjustmentValue:
          item.amountAdjustmentValue == null
            ? null
            : Number(item.amountAdjustmentValue),
        lastAt: item.lastAt,
        endAt: item.endAt ? item.endAt : null,
        intervalName: interval?.name ?? undefined,
        amountAdjustmentIntervalName:
          amountAdjustmentInterval?.name ?? undefined,
      });
    });

    return reoccurrences;
  }

  private async loadReoccurrenceSkips(
    accountId?: string,
    budgetId?: number,
  ) {
    const reoccurrenceSkips = await this.db.reoccurrenceSkip.findMany({
      where: {
        accountId,
        ...(budgetId != null
          ? {
              reoccurrence: {
                register: { budgetId },
              },
            }
          : {}),
      },
    });

    // Load into cache
    reoccurrenceSkips.forEach((item) => {
      this.cache.reoccurrenceSkip.insert({
        ...item,
        skippedAt:
          item.skippedAt == null
            ? ""
            : dateTimeService.format("YYYY-MM-DD", item.skippedAt),
      });
    });

    return reoccurrenceSkips;
  }

  private async loadReoccurrenceSplits(
    accountId?: string,
    budgetId?: number,
  ) {
    const reoccurrenceSplits = await this.db.reoccurrenceSplit.findMany({
      where: {
        reoccurrence: {
          accountId,
          ...(budgetId != null
            ? { register: { budgetId } }
            : {}),
        },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    reoccurrenceSplits.forEach((item) => {
      this.cache.reoccurrenceSplit.insert({
        ...item,
        amount: Number(item.amount),
        amountMode: item.amountMode ?? "FIXED",
      });
    });

    return reoccurrenceSplits;
  }

  private async loadSavingsGoals(
    accountId?: string,
    budgetId?: number,
  ): Promise<CacheSavingsGoal[]> {
    const goals = await this.db.savingsGoal.findMany({
      where: {
        accountId,
        isArchived: false,
        ...(budgetId != null ? { budgetId } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });

    const cacheGoals: CacheSavingsGoal[] = goals.map((g) => ({
      id: g.id,
      accountId: g.accountId,
      budgetId: g.budgetId,
      name: g.name,
      targetAmount: Number(g.targetAmount),
      sourceAccountRegisterId: g.sourceAccountRegisterId,
      targetAccountRegisterId: g.targetAccountRegisterId,
      priorityOverDebt: g.priorityOverDebt,
      ignoreMinBalance: g.ignoreMinBalance,
      sortOrder: g.sortOrder,
      isArchived: g.isArchived,
    }));

    cacheGoals.forEach((goal) => {
      this.cache.savingsGoal.insert(goal);
    });

    return cacheGoals;
  }

  async getMinReoccurrenceDate(accountId?: string): Promise<Date | null> {
    const minDate = await this.db.reoccurrence.aggregate({
      _min: { lastAt: true },
      where: { register: { accountId } },
    });

    return minDate?._min?.lastAt || null;
  }
}
