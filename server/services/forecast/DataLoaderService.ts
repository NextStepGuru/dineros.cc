import type { PrismaClient } from "@prisma/client";
import type { IDataLoaderService, ForecastContext, AccountData } from "./types";
import type { CacheAccountRegister } from "./ModernCacheService";
import { ModernCacheService } from "./ModernCacheService";
import { dateTimeService } from "./DateTimeService";

export class DataLoaderService implements IDataLoaderService {
  constructor(private db: PrismaClient, private cache: ModernCacheService) {}

  async loadAccountData(context: ForecastContext): Promise<AccountData> {
    // Clear existing cache
    this.cache.accountRegister.clear();
    this.cache.registerEntry.clear();
    this.cache.reoccurrence.clear();
    this.cache.reoccurrenceSkip.clear();

    // Load account registers
    const accountRegisters = await this.loadAccountRegisters(context.accountId);

    // Load register entries
    const registerEntries = await this.loadRegisterEntries(context.accountId);

    // Load reoccurrences
    const reoccurrences = await this.loadReoccurrences(context.accountId);

    // Load reoccurrence skips
    const reoccurrenceSkips = await this.loadReoccurrenceSkips(
      context.accountId
    );

    const result = {
      accountRegisters,
      registerEntries,
      reoccurrences,
      reoccurrenceSkips,
    };

    return result;
  }

  private async loadAccountRegisters(
    accountId?: string
  ): Promise<CacheAccountRegister[]> {
    const accountRegisters = await this.db.accountRegister.findMany({
      where: { accountId },
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
      },
    });

    const lokiAccountRegisters: CacheAccountRegister[] = accountRegisters.map(
      (reg) => ({
        ...reg,
        balance: Number(reg.balance),
        latestBalance: Number(reg.latestBalance),
        minPayment: reg.minPayment ? Number(reg.minPayment) : null,
        apr1: reg.apr1 ? Number(reg.apr1) : null,
        apr2: reg.apr2 ? Number(reg.apr2) : null,
        apr3: reg.apr3 ? Number(reg.apr3) : null,
        loanOriginalAmount: reg.loanOriginalAmount
          ? Number(reg.loanOriginalAmount)
          : null,
        minAccountBalance: reg.minAccountBalance
          ? Number(reg.minAccountBalance)
          : null,
        accountSavingsGoal: reg.accountSavingsGoal
          ? Number(reg.accountSavingsGoal)
          : null,
        statementAt: dateTimeService.createUTC(reg.statementAt),
      })
    );

    // Load into cache
    lokiAccountRegisters.forEach((accountRegister) => {
      this.cache.accountRegister.insert(accountRegister);
    });

    return lokiAccountRegisters;
  }

  private async loadRegisterEntries(accountId?: string) {
    const registerEntries = await this.db.registerEntry.findMany({
      where: {
        register: { accountId },
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
      createdAt: dateTimeService.createUTC(entry.createdAt),
    }));

    // Insert into cache (this was missing!)
    cacheEntries.forEach((entry) => {
      this.cache.registerEntry.insert(entry);
    });

    return cacheEntries;
  }

  private async loadReoccurrences(accountId?: string) {
    const reoccurrences = await this.db.reoccurrence.findMany({
      where: { accountId },
      include: { interval: { select: { name: true } } },
    });

    // Load into cache
    reoccurrences.forEach((item) => {
      const { interval, ...rest } = item;
      this.cache.reoccurrence.insert({
        ...rest,
        amount: Number(item.amount),
        lastAt: item.lastAt,
        endAt: item.endAt ? item.endAt : null,
        intervalName: interval?.name ?? undefined,
      });
    });

    return reoccurrences;
  }

  private async loadReoccurrenceSkips(accountId?: string) {
    const reoccurrenceSkips = await this.db.reoccurrenceSkip.findMany({
      where: { accountId },
    });

    // Load into cache
    reoccurrenceSkips.forEach((item) => {
      this.cache.reoccurrenceSkip.insert({
        ...item,
        skippedAt: dateTimeService.format("YYYY-MM-DD", item.skippedAt),
      });
    });

    return reoccurrenceSkips;
  }

  async getMinReoccurrenceDate(accountId?: string): Promise<Date | null> {
    const minDate = await this.db.reoccurrence.aggregate({
      _min: { lastAt: true },
      where: { register: { accountId } },
    });

    return minDate?._min?.lastAt || null;
  }
}
