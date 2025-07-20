import moment from "moment";
import type { PrismaClient } from "@prisma/client";
import type { IForecastEngine, ForecastContext, ForecastResult } from "./types";
import type { RegisterEntry } from "~/types/types";
import type { CacheRegisterEntry } from "./ModernCacheService";
import { ModernCacheService } from "./ModernCacheService";
import { DataLoaderService } from "./DataLoaderService";
import { AccountRegisterService } from "./AccountRegisterService";
import { ReoccurrenceService } from "./ReoccurrenceService";
import { RegisterEntryService } from "./RegisterEntryService";
import { LoanCalculatorService } from "./LoanCalculatorService";
import { TransferService } from "./TransferService";
import { DataPersisterService } from "./DataPersisterService";
import { MAX_YEARS, IS_CREDIT_TYPE_IDS } from "~/consts";
import { createId } from "@paralleldrive/cuid2";

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
    try {
      // 1. Load data from database into memory cache
      const accountData = await this.dataLoader.loadAccountData(context);

      // 2. Cleanup old projected entries (but NOT pending entries)
      await this.dataPersister.performInitialCleanup(context.accountId);

      // Only use non-archived account registers
      const activeAccountRegisters = accountData.accountRegisters.filter(
        (a) => !a.isArchived
      );

      // 3. Create balance entries for all loaded active accounts
      this.accountService.createBalanceEntries(activeAccountRegisters);

      // 4. Get forecast date range
      const minDate = await this.dataLoader.getMinReoccurrenceDate(
        context.accountId
      );
      const startDate = this.calculateStartDate(minDate || new Date());
      const endDate = moment(context.endDate).utc().set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      });

      console.log(
        `[ForecastEngine] Date range: startDate=${startDate.format(
          "YYYY-MM-DD"
        )}, endDate=${endDate.format("YYYY-MM-DD")}`
      );
      console.log(
        `[ForecastEngine] Context endDate: ${moment(context.endDate).format(
          "YYYY-MM-DD"
        )}`
      );

      // 5. Load existing manual entries into the timeline
      await this.loadExistingEntries(accountData, startDate);

      // 6. Process forecast day by day
      try {
        await this.processForecastTimeline(startDate, endDate);
      } catch (error) {
        console.error(
          `[ForecastEngine] Error in processForecastTimeline:`,
          error
        );
        throw error;
      }

      // 7. Calculate running balances and sort entries
      let processedResults = await this.processAccountEntries(
        activeAccountRegisters
      );

      // Balance entries are already created by createBalanceEntries method
      // No need to create additional ones here

      // 8. Purge all projected entries before persisting new forecast results
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

      // 9. Filter out manual entries and pending entries to prevent duplication - they already exist in database
      // Pending entries come from Plaid sync and should not be re-inserted
      const entriesToPersist = processedResults.filter(
        (e) => !e.isManualEntry && !e.isPending
      );

      console.log(
        `[ForecastEngine] Persisting ${entriesToPersist.length} entries (filtered out ${manualEntriesToPersist.length} manual entries and ${pendingEntriesToPersist.length} pending entries to prevent duplication)`
      );

      // 10. Persist results back to database
      await this.dataPersister.persistForecastResults(entriesToPersist);

      // 11. Update balance columns for ALL entries (including isPending, manual, etc.)
      await this.dataPersister.updateRegisterEntryBalances(processedResults);

      // 12. Update account register latestBalance fields to reflect current balances
      if (context.accountId) {
        await this.dataPersister.updateAccountRegisterBalances(
          context.accountId
        );
      }

      // 13. Update entry statuses based on current date
      await this.dataPersister.updateEntryStatuses(context.accountId);

      // 13. Final cleanup
      await this.dataPersister.performFinalCleanup(context.accountId);

      // 14. Convert results to expected format
      const finalResults = this.convertToFinalFormat(processedResults);

      return {
        registerEntries: finalResults,
        accountRegisters: accountData.accountRegisters.map((acc) => ({
          ...acc,
          statementAt: acc.statementAt.toDate(),
        })) as any[], // TODO: Fix type mapping for AccountRegister
        isSuccess: true,
      };
    } catch (error) {
      console.error("Forecast calculation failed:", error);
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

  private calculateStartDate(minDate: Date): moment.Moment {
    return moment(minDate).utc().set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    });
  }

  private calculateEndDate(): moment.Moment {
    return moment()
      .utc()
      .set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      })
      .add({ year: MAX_YEARS });
  }

  private async loadExistingEntries(
    accountData: any,
    startDate: moment.Moment
  ): Promise<void> {
    try {
      // Load ALL existing entries (including isPending from Plaid) to ensure accurate balance calculations
      // We need to include entries that occur on or after startDate if they're real transactions
      const existingEntries = accountData.registerEntries;

      console.log(
        `[ForecastEngine] Loading ${existingEntries.length} existing entries into forecast calculations`
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
      console.error(`[ForecastEngine] Error in loadExistingEntries:`, error);
      throw error;
    }
  }

  private async processForecastTimeline(
    startDate: moment.Moment,
    endDate: moment.Moment
  ): Promise<void> {
    const currentDate = startDate.clone();
    let dayCount = 0;

    console.log(
      `[ForecastEngine] Starting timeline processing from ${startDate.format(
        "YYYY-MM-DD"
      )} to ${endDate.format("YYYY-MM-DD")}`
    );

    while (currentDate.isBefore(endDate)) {
      dayCount++;
      if (dayCount % 100 === 0) {
        console.log(
          `[ForecastEngine] Processed ${dayCount} days, current date: ${currentDate.format(
            "YYYY-MM-DD"
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

    console.log(
      `[ForecastEngine] Completed timeline processing. Total days processed: ${dayCount}`
    );
  }

  private async loadManualEntriesForDate(date: moment.Moment): Promise<void> {
    // This would load manual entries that were created for this specific date
    // Implementation depends on how manual entries are stored
    // For now, we'll use the cache to find existing entries for this date
    const entries = this.cache.registerEntry.find(
      (entry) =>
        entry.isManualEntry === true &&
        moment(entry.createdAt).isSame(date, "day")
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

      // Filter out skipped entries
      const filteredEntries =
        this.entryService.filterSkippedEntries(accountEntries);

      // Calculate running balances and sort
      const accountType = IS_CREDIT_TYPE_IDS.includes(accountRegister.typeId)
        ? "credit"
        : "debit";

      const sortedEntries = this.entryService.calculateRunningBalances(
        filteredEntries,
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
        createdAt: moment(item.createdAt).utc().toISOString(),
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
