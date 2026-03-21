import type { PrismaClient } from "@prisma/client";
import prismaPkg from "@prisma/client";
import type { IForecastEngine, ForecastContext, ForecastResult } from "./types";
import type { RegisterEntry } from "../../../types/types";
import type { CacheRegisterEntry } from "./ModernCacheService";
import { ModernCacheService } from "./ModernCacheService";
import { DataLoaderService } from "./DataLoaderService";
import { AccountRegisterService } from "./AccountRegisterService";
import { ReoccurrenceService } from "./ReoccurrenceService";
import { RegisterEntryService } from "./RegisterEntryService";
import { LoanCalculatorService } from "./LoanCalculatorService";
import { TransferService } from "./TransferService";
import { DataPersisterService } from "./DataPersisterService";
import { AssetDepreciationService } from "./AssetDepreciationService";
import { IS_CREDIT_TYPE_IDS } from "../../../consts";
import { forecastLogger } from "./logger";
import { dateTimeService } from "./DateTimeService";
import { DateTime } from "./DateTime";

const { Prisma } = prismaPkg;

export class ForecastEngine implements IForecastEngine {
  private cache: ModernCacheService;
  private dataLoader: DataLoaderService;
  private accountService: AccountRegisterService;
  private reoccurrenceService: ReoccurrenceService;
  private entryService: RegisterEntryService;
  private loanCalculator: LoanCalculatorService;
  private transferService: TransferService;
  private assetService: AssetDepreciationService;
  private dataPersister: DataPersisterService;

  constructor(private db: PrismaClient) {
    this.cache = new ModernCacheService();
    this.dataLoader = new DataLoaderService(db, this.cache);
    this.loanCalculator = new LoanCalculatorService();
    this.entryService = new RegisterEntryService(db, this.cache);
    this.transferService = new TransferService(this.cache, this.entryService);
    this.accountService = new AccountRegisterService(
      db,
      this.cache,
      this.loanCalculator,
      this.entryService,
      this.transferService
    );
    this.reoccurrenceService = new ReoccurrenceService(
      db,
      this.cache,
      this.entryService,
      this.transferService
    );
    this.assetService = new AssetDepreciationService(
      this.cache,
      this.entryService
    );
    this.dataPersister = new DataPersisterService(db);
  }

  async recalculate(context: ForecastContext): Promise<ForecastResult> {
    try {
      // Set up logging configuration
      if (context.logging) {
        forecastLogger.setConfig(context.logging);
      }

      // 1. Load data from database into memory cache
      const accountData = await this.dataLoader.loadAccountData(context);

      await this.db.$transaction(async (tx) => {
        await this.dataPersister.convertOldProjectedToPending(
          context.accountId,
          tx
        );
        const accountRegisterIds = context.accountId
          ? accountData.accountRegisters.map((r) => r.id)
          : undefined;
        await this.dataPersister.performInitialCleanup(
          context.accountId,
          tx,
          accountRegisterIds
        );
      });

      // Only use non-archived account registers
      const activeAccountRegisters = accountData.accountRegisters.filter(
        (a) => !a.isArchived
      );

      // 4. Create balance entries for all loaded active accounts
      this.accountService.createBalanceEntries(activeAccountRegisters);

      // 5. Get forecast date range (minReoccurrenceDate from load)
      const minDate = accountData.minReoccurrenceDate;
      const effectiveStartDate =
        context.startDate || minDate || dateTimeService.nowDate();
      const startDate = this.calculateStartDate(effectiveStartDate);
      const endDate = dateTimeService.createUTC(context.endDate).set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      });

      forecastLogger.info(
        `Date range: startDate=${dateTimeService.format(
          "YYYY-MM-DD",
          startDate
        )}, endDate=${dateTimeService.format("YYYY-MM-DD", endDate)}`
      );
      forecastLogger.info(
        `Context endDate: ${dateTimeService.format(
          "YYYY-MM-DD",
          context.endDate
        )}`
      );

      // Validate that the forecast date range doesn't exceed 10 years
      const yearsDifference = endDate.diff(startDate, "years");
      if (yearsDifference > 10) {
        const errorMessage = `Forecast date range exceeds 10 years: ${yearsDifference} years from ${dateTimeService.format(
          "YYYY-MM-DD",
          startDate
        )} to ${dateTimeService.format("YYYY-MM-DD", endDate)}`;
        forecastLogger.error(errorMessage);
        throw new Error(errorMessage);
      }

      // 6. Load existing manual entries into the timeline
      await this.loadExistingEntries(accountData);

      this.accountService.alignStatementAtForForecastStart(
        startDate,
        activeAccountRegisters,
      );

      this.accountService.clearPendingStatementAtUpdates();

      // 7. Process forecast day by day
      let datesProcessed = 0;
      try {
        datesProcessed = await this.processForecastTimeline(startDate, endDate);
      } catch (error) {
        forecastLogger.error(`Error in processForecastTimeline:`, error);
        throw error;
      }

      // 8. Calculate running balances and sort entries
      let processedResults = await this.processAccountEntries(
        activeAccountRegisters
      );

      const manualEntriesToPersist = processedResults.filter(
        (e) => e.isManualEntry
      );
      const pendingEntriesToPersist = processedResults.filter(
        (e) => e.isPending
      );

      const entriesToPersist = processedResults.filter(
        (e) =>
          !e.isManualEntry && !e.isPending && e.isProjected
      );

      forecastLogger.info(
        `Persisting ${entriesToPersist.length} entries (filtered out ${manualEntriesToPersist.length} manual entries and ${pendingEntriesToPersist.length} pending entries to prevent duplication)`
      );

      await this.db.$transaction(async (tx) => {
        // 7b. Persist updated reoccurrence lastAt
        const reoccurrences = this.cache.reoccurrence.find();
        await this.dataPersister.persistReoccurrenceLastAt(reoccurrences, tx);

        // 9. Purge all projected entries before persisting new forecast results
        await this.dataPersister.cleanupProjectedEntries(context.accountId, tx);

        // 11. Persist results back to database
        const persistIdMap = await this.dataPersister.persistForecastResults(
          entriesToPersist,
          tx
        );
        for (const e of processedResults) {
          const newId = persistIdMap.get(e.id);
          if (newId !== undefined) e.id = newId;
        }

        // 12. Update balance columns for ALL entries
        await this.dataPersister.updateRegisterEntryBalances(
          processedResults,
          tx
        );

        // 13. Do not update account register latest_balance from forecast; user/Plaid are the source of truth.

        const statementAtUpdates =
          this.accountService.getPendingStatementAtUpdates();
        if (statementAtUpdates.length > 0) {
          await this.dataPersister.batchUpdateStatementDates(
            statementAtUpdates,
            tx
          );
          this.accountService.clearPendingStatementAtUpdates();
        }

        // 14. Update entry statuses based on current date
        await this.dataPersister.updateEntryStatuses(context.accountId, tx);

        // 15. Final cleanup
        await this.dataPersister.performFinalCleanup(context.accountId, tx);
      });

      // 14. Convert results to expected format
      forecastLogger.debug(
        `Converting ${processedResults.length} processed results to final format`
      );
      const finalResults = this.convertToFinalFormat(processedResults);
      forecastLogger.debug(`Final results: ${finalResults.length} entries`);
      forecastLogger.debug("=== FORECAST ENGINE RECALCULATE SUCCESS ===");

      return {
        registerEntries: finalResults,
        accountRegisters: accountData.accountRegisters.map((acc) => ({
          ...acc,
          statementAt: dateTimeService.toDate(acc.statementAt),
        })) as any[], // TODO: Fix type mapping for AccountRegister
        isSuccess: true,
        datesProcessed,
      };
    } catch (error) {
      forecastLogger.error("Forecast calculation failed:", error);
      return {
        registerEntries: [],
        accountRegisters: [],
        isSuccess: false,
        datesProcessed: 0,
        errors: [
          error instanceof Error ? error.message : "Unknown error occurred",
        ],
      };
    }
  }

  private calculateStartDate(minDate: Date): any {
    // Handle null/undefined/invalid dates
    if (!minDate || !dateTimeService.isValid(minDate)) {
      // Return an invalid DateTime for null/undefined/invalid inputs
      return new DateTime("invalid-date");
    }

    return dateTimeService.createUTC(minDate).set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    });
  }

  private calculateEndDate(): any {
    return dateTimeService.createUTC(dateTimeService.now()).set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    });
  }

  private async loadExistingEntries(
    accountData: any
  ): Promise<void> {
    try {
      // Load ALL existing entries (including isPending from Plaid) to ensure accurate balance calculations
      // We need to include entries that occur on or after startDate if they're real transactions
      const existingEntries = accountData.registerEntries;

      forecastLogger.info(
        `Loading ${existingEntries.length} existing entries into forecast calculations`
      );

      existingEntries.forEach((entry: any) => {
        this.entryService.createEntry({
          id: entry.id,
          accountRegisterId: entry.accountRegisterId,
          description: entry.description,
          amount: entry.amount,
          isManualEntry: entry.isManualEntry,
          isBalanceEntry: entry.isBalanceEntry,
          isProjected: entry.isProjected,
          isPending: entry.isPending, // Preserve isPending status
          manualCreatedAt: entry.createdAt,
          typeId: entry.typeId, // Preserve typeId from existing entries
          categoryId: entry.categoryId ?? null,
          reoccurrenceId: entry.reoccurrenceId ?? null,
        });
      });
    } catch (error) {
      forecastLogger.error(`Error in loadExistingEntries:`, error);
      throw error;
    }
  }

  private async processForecastTimeline(
    startDate: any,
    endDate: any
  ): Promise<number> {
    let currentDate = dateTimeService.clone(startDate);
    let dayCount = 0;

    forecastLogger.info(
      `Starting timeline processing from ${dateTimeService.format(
        "YYYY-MM-DD",
        startDate
      )} to ${dateTimeService.format("YYYY-MM-DD", endDate)}`
    );

    this.reoccurrenceService.initReoccurrenceSchedule(
      dateTimeService.toDate(startDate),
      dateTimeService.toDate(endDate)
    );
    this.accountService.initTimelineAccountCaches();

    while (currentDate.isSameOrBefore(endDate)) {
      dayCount++;
      if (dayCount % 100 === 0) {
        forecastLogger.info(
          `Processed ${dayCount} days, current date: ${dateTimeService.format(
            "YYYY-MM-DD",
            currentDate
          )}`
        );
      }
      // Process reoccurrences first so same-day debits are in the cache before we consider extra debt/savings
      const dueReoccurrences = this.reoccurrenceService.getReoccurrencesDue(
        currentDate.toDate()
      );
      await this.reoccurrenceService.processReoccurrences(
        dueReoccurrences.map((reoccurrence) => ({
          ...reoccurrence,
          amount: new Prisma.Decimal(reoccurrence.amount),
          amountAdjustmentValue:
            reoccurrence.amountAdjustmentValue != null
              ? new Prisma.Decimal(reoccurrence.amountAdjustmentValue)
              : null,
          lastAt: reoccurrence.lastAt || dateTimeService.nowDate(),
          updatedAt: reoccurrence.updatedAt || dateTimeService.nowDate(),
        })),
        currentDate.toDate()
      );

      // Process interest charges for debt accounts (including minimum payments)
      const interestAccounts = this.accountService.getInterestBearingAccounts();
      await this.accountService.processInterestCharges(
        interestAccounts,
        currentDate.toDate()
      );

      // Statement advances only inside processAccountInterestCharge (one period per posted cycle).
      // Batch updateStatementDates here skipped interest rows by multi-advancing statementAt.

      // Process asset depreciation/appreciation AFTER interest charges
      const depreciatingAssets = this.assetService.getDepreciatingAssets();
      const appreciatingAssets = this.assetService.getAppreciatingAssets();
      await this.assetService.processAssetValueChanges(
        [...depreciatingAssets, ...appreciatingAssets],
        currentDate.toDate()
      );

      // Process high-priority savings goals (priorityOverDebt) before extra debt payments
      const extraPaymentAccounts =
        this.accountService.getAccountsWithExtraPayments();
      await this.transferService.processHighPriorityGoals(
        extraPaymentAccounts,
        currentDate.toDate()
      );

      // Process extra debt payments AFTER reoccurrences and interest so projected balance reflects same-day outflows
      await this.transferService.processExtraDebtPayments(
        extraPaymentAccounts,
        currentDate.toDate()
      );

      // Process savings goals AFTER debt is paid
      await this.transferService.processSavingsGoals(
        extraPaymentAccounts,
        currentDate.toDate()
      );

      // Load manual entries for this specific date
      await this.loadManualEntriesForDate(currentDate);

      // Move to next day
      currentDate = currentDate.add(1, "day");
    }

    forecastLogger.info(
      `Completed timeline processing. Total days processed: ${dayCount}`
    );
    return dayCount;
  }

  private async loadManualEntriesForDate(date: any): Promise<void> {
    const dayStart = dateTimeService.startOfDay(date).valueOf();
    const dayEnd = dateTimeService.startOfDay(dateTimeService.add(1, "day", date)).valueOf();
    this.cache.registerEntry.find(
      (entry) =>
        entry.isManualEntry === true &&
        (entry.createdAt as { valueOf(): number }).valueOf() >= dayStart &&
        (entry.createdAt as { valueOf(): number }).valueOf() < dayEnd
    );
    // Entries are already in cache from initial load; no-op for now
  }

  private async processAccountEntries(
    accountRegisters: any[]
  ): Promise<CacheRegisterEntry[]> {
    const returnRegisterEntries: CacheRegisterEntry[] = [];

    for (const accountRegister of accountRegisters) {
      const accountEntriesAll = this.cache.registerEntry.find({
        accountRegisterId: accountRegister.id,
      });
      const accountEntries = accountEntriesAll;

      // Calculate running balances and sort
      const accountType = IS_CREDIT_TYPE_IDS.includes(accountRegister.typeId)
        ? "credit"
        : "debit";

      const sortedEntries = this.entryService.calculateRunningBalances(
        accountEntries, // Use all entries including balance entries
        0, // Initial balance is now handled by the balance entry's amount
        accountType
      );

      returnRegisterEntries.push(...sortedEntries);

      // Update entry statuses for this account
      await this.entryService.updateEntryStatuses(accountRegister.id);
    }

    return returnRegisterEntries;
  }

  private convertToFinalFormat(results: CacheRegisterEntry[]): RegisterEntry[] {
    return results
      .sort((a, b) => (a.seq && b.seq ? a.seq - b.seq : 0))
      .map((item) => ({
        id: item.id === "new" ? undefined : item.id,
        accountRegisterId: item.accountRegisterId,
        sourceAccountRegisterId: item.sourceAccountRegisterId || undefined,
        createdAt: dateTimeService.toDate(item.createdAt).toISOString(),
        description: item.description,
        reoccurrenceId: item.reoccurrenceId,
        amount: item.amount,
        balance: item.balance,
        typeId: item.typeId,
        categoryId: item.categoryId ?? null,
        isCleared: item.isCleared,
        isReconciled: item.isReconciled,
        isProjected: item.isProjected,
        isBalanceEntry: item.isBalanceEntry,
        isPending: item.isPending,
      }));
  }

  // Public methods for testing and debugging
  public getCache(): ModernCacheService {
    return this.cache;
  }

  public async validateResults(context: ForecastContext): Promise<boolean> {
    try {
      const counts = await this.dataPersister.getResultsCount(
        context.accountId
      );
      return counts.projected > 0 || counts.pending > 0 || counts.manual > 0;
    } catch {
      return false;
    }
  }
}
