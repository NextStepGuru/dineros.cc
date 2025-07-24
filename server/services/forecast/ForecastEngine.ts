import type { PrismaClient } from "@prisma/client";
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
import { MAX_YEARS, IS_CREDIT_TYPE_IDS } from "../../../consts";
import { createId } from "@paralleldrive/cuid2";
import { forecastLogger } from "./logger";
import { dateTimeService } from "./DateTimeService";

export class ForecastEngine implements IForecastEngine {
  private cache: ModernCacheService;
  private dataLoader: DataLoaderService;
  private accountService: AccountRegisterService;
  private reoccurrenceService: ReoccurrenceService;
  private entryService: RegisterEntryService;
  private loanCalculator: LoanCalculatorService;
  private transferService: TransferService;
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
    this.dataPersister = new DataPersisterService(db);
  }

  async recalculate(context: ForecastContext): Promise<ForecastResult> {
    console.log("=== FORECAST ENGINE RECALCULATE START ===");
    console.log("ForecastEngine.recalculate called with context:", context);
    try {
      // Set up logging configuration
      if (context.logging) {
        forecastLogger.setConfig(context.logging);
      }

      // 1. Load data from database into memory cache
      console.log("Loading account data...");
      const accountData = await this.dataLoader.loadAccountData(context);
      console.log(
        `Loaded ${accountData.accountRegisters.length} account registers, ${accountData.registerEntries.length} register entries`
      );

      // 2. Convert old projected entries to pending entries before cleanup
      await this.dataPersister.convertOldProjectedToPending(context.accountId);

      // 3. Cleanup old projected entries (but NOT pending entries)
      await this.dataPersister.performInitialCleanup(context.accountId);

      // Only use non-archived account registers
      const activeAccountRegisters = accountData.accountRegisters.filter(
        (a) => !a.isArchived
      );

      // 4. Create balance entries for all loaded active accounts
      console.log(
        `Creating balance entries for ${activeAccountRegisters.length} accounts`
      );
      this.accountService.createBalanceEntries(activeAccountRegisters);
      console.log(
        `Balance entries created. Cache now has ${
          this.cache.registerEntry.find({}).length
        } entries`
      );

      // 5. Get forecast date range
      const minDate = await this.dataLoader.getMinReoccurrenceDate(
        context.accountId
      );
      // Use context.startDate if provided, otherwise fall back to minDate or current date
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

      // 6. Load existing manual entries into the timeline
      console.log(`Loading existing entries. accountData.registerEntries length = ${accountData.registerEntries?.length || 0}`);
      await this.loadExistingEntries(accountData, startDate);
      console.log(`After loading existing entries. Cache has ${this.cache.registerEntry.find({}).length} entries`);

      // 7. Process forecast day by day
      try {
        await this.processForecastTimeline(startDate, endDate);
      } catch (error) {
        forecastLogger.error(`Error in processForecastTimeline:`, error);
        throw error;
      }

      // 8. Calculate running balances and sort entries
      let processedResults = await this.processAccountEntries(
        activeAccountRegisters
      );

      // Balance entries are already created by createBalanceEntries method
      // No need to create additional ones here

      // 9. Purge all projected entries before persisting new forecast results
      await this.dataPersister.cleanupProjectedEntries(context.accountId);

      // Debug: Check what we're about to persist
      const balanceEntriesToPersist = processedResults.filter(
        (e) => e.isBalanceEntry
      );
      const manualEntriesToPersist = processedResults.filter(
        (e) => e.isManualEntry
      );
      const pendingEntriesToPersist = processedResults.filter(
        (e) => e.isPending
      );

      // 10. Filter out manual entries and pending entries to prevent duplication - they already exist in database
      // Pending entries come from Plaid sync and should not be re-inserted
      const entriesToPersist = processedResults.filter(
        (e) => !e.isManualEntry && !e.isPending
      );

      forecastLogger.info(
        `Persisting ${entriesToPersist.length} entries (filtered out ${manualEntriesToPersist.length} manual entries and ${pendingEntriesToPersist.length} pending entries to prevent duplication)`
      );

      // 11. Persist results back to database
      await this.dataPersister.persistForecastResults(entriesToPersist);

      // 12. Update balance columns for ALL entries (including isPending, manual, etc.)
      await this.dataPersister.updateRegisterEntryBalances(processedResults);

      // 13. Update account register latestBalance fields to reflect current balances
      if (context.accountId) {
        await this.dataPersister.updateAccountRegisterBalances(
          context.accountId
        );
      }

      // 14. Update entry statuses based on current date
      await this.dataPersister.updateEntryStatuses(context.accountId);

      // 15. Final cleanup
      await this.dataPersister.performFinalCleanup(context.accountId);

      // 14. Convert results to expected format
      console.log(`Converting ${processedResults.length} processed results to final format`);
      const finalResults = this.convertToFinalFormat(processedResults);
      console.log(`Final results: ${finalResults.length} entries`);
      console.log("=== FORECAST ENGINE RECALCULATE SUCCESS ===");

      return {
        registerEntries: finalResults,
        accountRegisters: accountData.accountRegisters.map((acc) => ({
          ...acc,
          statementAt: acc.statementAt.toDate(),
        })) as any[], // TODO: Fix type mapping for AccountRegister
        isSuccess: true,
      };
    } catch (error) {
      console.log("=== FORECAST ENGINE RECALCULATE ERROR ===");
      forecastLogger.error("Forecast calculation failed:", error);
      console.error("Forecast calculation failed:", error);
      console.error("Error type:", typeof error);
      console.error("Error constructor:", error?.constructor?.name);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      return {
        registerEntries: [],
        accountRegisters: [],
        isSuccess: false,
        errors: [
          error instanceof Error ? error.message : "Unknown error occurred",
        ],
      };
    }
  }

  private calculateStartDate(minDate: Date): any {
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
    accountData: any,
    startDate: any
  ): Promise<void> {
    try {
      // Load ALL existing entries (including isPending from Plaid) to ensure accurate balance calculations
      // We need to include entries that occur on or after startDate if they're real transactions
      const existingEntries = accountData.registerEntries;

      console.log(`loadExistingEntries: accountData.registerEntries length = ${existingEntries?.length || 0}`);
      console.log(`loadExistingEntries: existingEntries =`, existingEntries);

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
          isPending: entry.isPending, // Preserve isPending status
          manualCreatedAt: entry.createdAt,
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
  ): Promise<void> {
    const currentDate = dateTimeService.clone(startDate);
    let dayCount = 0;

    forecastLogger.info(
      `Starting timeline processing from ${dateTimeService.format(
        "YYYY-MM-DD",
        startDate
      )} to ${dateTimeService.format("YYYY-MM-DD", endDate)}`
    );

    while (currentDate.isBefore(endDate)) {
      dayCount++;
      if (dayCount % 100 === 0) {
        forecastLogger.info(
          `Processed ${dayCount} days, current date: ${dateTimeService.format(
            "YYYY-MM-DD",
            currentDate
          )}`
        );
      }
      // Process extra debt payments FIRST to use all available funds
      const extraPaymentAccounts =
        this.accountService.getAccountsWithExtraPayments();
      await this.transferService.processExtraDebtPayments(
        extraPaymentAccounts,
        currentDate.toDate()
      );

      // Process savings goals AFTER debt is paid
      await this.transferService.processSavingsGoals(
        extraPaymentAccounts,
        currentDate.toDate()
      );

      // Process interest charges for debt accounts (including minimum payments)
      const interestAccounts = this.accountService.getInterestBearingAccounts();
      await this.accountService.processInterestCharges(
        interestAccounts,
        currentDate
      );

      // Update statement dates after processing interest to advance to next statement date
      await this.accountService.updateStatementDates(
        interestAccounts,
        currentDate
      );

      // Process reoccurrences due on this date
      const dueReoccurrences = this.reoccurrenceService.getReoccurrencesDue(
        currentDate.toDate()
      );
      await this.reoccurrenceService.processReoccurrences(
        dueReoccurrences,
        endDate.toDate()
      );

      // Load manual entries for this specific date
      await this.loadManualEntriesForDate(currentDate);

      // Move to next day
      currentDate.add({ day: 1 });
    }

    forecastLogger.info(
      `Completed timeline processing. Total days processed: ${dayCount}`
    );
  }

  private async loadManualEntriesForDate(date: any): Promise<void> {
    // This would load manual entries that were created for this specific date
    // Implementation depends on how manual entries are stored
    // For now, we'll use the cache to find existing entries for this date
    const entries = this.cache.registerEntry.find(
      (entry) =>
        entry.isManualEntry === true &&
        dateTimeService.isSameOrBefore(entry.createdAt, date) &&
        dateTimeService.isSameOrAfter(entry.createdAt, date)
    );

    // These entries should already be in the cache from the initial load
    // So this step might be redundant in the current implementation
  }

  private async processAccountEntries(
    accountRegisters: any[]
  ): Promise<CacheRegisterEntry[]> {
    const returnRegisterEntries: CacheRegisterEntry[] = [];

    for (const accountRegister of accountRegisters) {
      const accountEntries = this.cache.registerEntry.find({
        accountRegisterId: accountRegister.id,
      });
      const balanceEntries = accountEntries.filter((e) => e.isBalanceEntry);

      console.log(
        `Account ${accountRegister.id}: Found ${accountEntries.length} entries, ${balanceEntries.length} balance entries`
      );
      console.log(`Cache has ${this.cache.registerEntry.find({}).length} total entries`);
      console.log(`Account entries:`, accountEntries);

      // Filter out skipped entries
      const filteredEntries =
        this.entryService.filterSkippedEntries(accountEntries);

      // Calculate running balances and sort
      const accountType = IS_CREDIT_TYPE_IDS.includes(accountRegister.typeId)
        ? "credit"
        : "debit";

      const sortedEntries = this.entryService.calculateRunningBalances(
        accountEntries, // Use all entries including balance entries
        0, // Initial balance is now handled by the balance entry's amount
        accountType
      );

      console.log(
        `Account ${accountRegister.id}: Sorted entries: ${sortedEntries.length}`
      );

      returnRegisterEntries.push(...sortedEntries);

      // Update entry statuses for this account
      await this.entryService.updateEntryStatuses(accountRegister.id);
    }

    console.log(`Total entries to return: ${returnRegisterEntries.length}`);
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
