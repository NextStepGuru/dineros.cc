import type { PrismaClient } from "@prisma/client";
import moment from "moment";
import type { IDataLoaderService, ForecastContext, AccountData } from "./types";
import type { CacheAccountRegister } from "./ModernCacheService";
import { ModernCacheService } from "./ModernCacheService";

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

    return {
      accountRegisters,
      registerEntries,
      reoccurrences,
      reoccurrenceSkips,
    };
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

    console.log(
      `[DataLoaderService] Loaded ${accountRegisters.length} account registers from database`
    );
    accountRegisters.forEach((reg) => {
      console.log(
        `[DataLoaderService] Account ${reg.id} (${reg.name}): balance=${reg.balance}, typeId=${reg.typeId}, targetAccountRegisterId=${reg.targetAccountRegisterId}`
      );
    });

    const lokiAccountRegisters: CacheAccountRegister[] = accountRegisters.map(
      (reg) => ({
        ...reg,
        statementAt: moment(reg.statementAt).utc(),
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
      createdAt: moment(entry.createdAt).utc(),
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
    });

    // Load into cache
    reoccurrences.forEach((item) => {
      this.cache.reoccurrence.insert({
        ...item,
        lastAt: item.lastAt,
        endAt: item.endAt ? item.endAt : null,
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
        skippedAt: moment(item.skippedAt).toISOString(),
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
