import type { ITransferService, TransferParams } from "./types";
import type { CacheAccountRegister } from "./ModernCacheService";
import { ModernCacheService } from "./ModernCacheService";
import { RegisterEntryService } from "./RegisterEntryService";
import { forecastLogger } from "./logger";
import { dateTimeService } from "./DateTimeService";

export class TransferService implements ITransferService {
  constructor(
    private cache: ModernCacheService,
    private entryService: RegisterEntryService
  ) {}

  transferBetweenAccounts(params: TransferParams): void {
    const {
      targetAccountRegisterId,
      sourceAccountRegisterId,
      amount,
      description,
      reoccurrence,
      fromDescription,
    } = params;

    // Create entry for target account (receiving money)
    this.entryService.createEntry({
      accountRegisterId: targetAccountRegisterId,
      description,
      sourceAccountRegisterId,
      amount: +amount,
      reoccurrence,
    });

    // Create entry for source account (sending money)
    this.entryService.createEntry({
      accountRegisterId: sourceAccountRegisterId,
      sourceAccountRegisterId: targetAccountRegisterId,
      description: fromDescription || `Transfer for ${description}`,
      amount: +amount * -1,
      reoccurrence,
    });
  }

  transferBetweenAccountsWithDate(
    params: TransferParams & { forecastDate: Date }
  ): void {
    const {
      targetAccountRegisterId,
      sourceAccountRegisterId,
      amount,
      description,
      reoccurrence,
      fromDescription,
      forecastDate,
    } = params;

    // Create entry for target account (receiving money)
    this.entryService.createEntry({
      accountRegisterId: targetAccountRegisterId,
      description,
      sourceAccountRegisterId,
      amount: +amount,
      reoccurrence,
      forecastDate,
    });

    // Create entry for source account (sending money)
    this.entryService.createEntry({
      accountRegisterId: sourceAccountRegisterId,
      sourceAccountRegisterId: targetAccountRegisterId,
      description: fromDescription || `Transfer for ${description}`,
      amount: +amount * -1,
      reoccurrence,
      forecastDate,
    });
  }

  async processExtraDebtPayments(
    sourceAccounts: CacheAccountRegister[],
    targetDate: Date
  ): Promise<void> {
    // Log which accounts have extra payment enabled
    const extraPaymentAccounts = sourceAccounts.filter(
      (acc) => acc.allowExtraPayment === true
    );
    if (extraPaymentAccounts.length > 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Found ${extraPaymentAccounts.length} accounts with allowExtraPayment=true:`,
        extraPaymentAccounts.map((acc) => ({
          id: acc.id,
          name: acc.name,
          balance: acc.balance,
          minBalance: acc.minAccountBalance,
        }))
      );
    }

    for (const sourceAccount of sourceAccounts) {
      const shouldProcess = this.shouldProcessExtraDebtPaymentOnDate(
        sourceAccount,
        targetDate
      );

      if (shouldProcess) {
        await this.processExtraDebtPayment({
          minBalance: +(sourceAccount.minAccountBalance || 0),
          sourceAccountId: sourceAccount.id,
          lastAt: targetDate,
        });
      }
    }
  }

  private shouldProcessExtraDebtPayment(
    account: CacheAccountRegister,
    targetDate?: Date
  ): boolean {
    // If targetDate is provided, calculate projected balance at that date
    let balanceToUse = account.balance;
    if (targetDate) {
      balanceToUse = this.calculateProjectedBalanceAtDate(
        account.id,
        targetDate
      );
    }

    const isEligible =
      account.minAccountBalance !== null &&
      account.minAccountBalance !== undefined &&
      balanceToUse > +account.minAccountBalance &&
      account.allowExtraPayment === true;

    // Calculate excess amount above minimum balance
    const excessAmount = balanceToUse - +account.minAccountBalance;

    // Use any excess amount above minimum balance (no artificial minimum required)
    const finalEligible = isEligible && excessAmount > 0;

    if (account.allowExtraPayment === true) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment eligibility for ${account.name}:`,
        {
          accountId: account.id,
          currentBalance: account.balance,
          projectedBalance: targetDate ? balanceToUse : "N/A",
          minBalance: account.minAccountBalance,
          excessAmount,
          allowExtraPayment: account.allowExtraPayment,
          isEligible,
          finalEligible,
          targetDate: targetDate?.toISOString().split("T")[0] || "N/A",
        }
      );
    }

    return finalEligible;
  }

  private shouldProcessExtraDebtPaymentOnDate(
    account: CacheAccountRegister,
    targetDate: Date
  ): boolean {
    // First check basic eligibility using projected balance at target date
    if (!this.shouldProcessExtraDebtPayment(account, targetDate)) {
      return false;
    }

    // Process on 1st of month, or if it's a weekend/holiday, process on next business day
    const date = new Date(targetDate);
    const dayOfMonth = date.getUTCDate(); // Use UTC to avoid timezone issues
    const shouldProcess =
      dayOfMonth === 1 || dayOfMonth === 2 || dayOfMonth === 3; // Allow 1st, 2nd, or 3rd to handle weekends/holidays

    return shouldProcess;
  }

  private calculateProjectedBalanceAtDate(
    accountId: number,
    targetDate: Date
  ): number {
    // Get the account's initial balance from cache
    const account = this.cache.accountRegister.findOne({ id: accountId });
    if (!account) return 0;

    // Get all entries for this account up to the target date
    const entries = this.cache.registerEntry
      .find({
        accountRegisterId: accountId,
      })
      .filter((entry) =>
        dateTimeService.isSameOrBefore(entry.createdAt, targetDate)
      );

    // Start with the initial balance and add all entries up to target date
    let projectedBalance = account.latestBalance;

    // Add up all entries up to the target date (excluding balance entries)
    for (const entry of entries) {
      if (!entry.isBalanceEntry) {
        projectedBalance = +projectedBalance + +entry.amount;
      }
    }

    return projectedBalance;
  }

  private async processExtraDebtPayment({
    minBalance,
    sourceAccountId,
    lastAt,
  }: {
    minBalance: number;
    sourceAccountId: number;
    lastAt: Date;
  }): Promise<boolean> {
    const sourceAccountRegister = this.cache.accountRegister.findOne({
      id: sourceAccountId,
    });

    if (!sourceAccountRegister) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment: Source account ${sourceAccountId} not found`
      );
      return false;
    }

    // Calculate the projected balance at the forecast date
    const projectedBalance = this.calculateProjectedBalanceAtDate(
      sourceAccountId,
      lastAt
    );

    forecastLogger.serviceDebug(
      "TransferService",
      `Extra debt payment projected balance check:`,
      {
        sourceAccountId: sourceAccountRegister.id,
        sourceAccountName: sourceAccountRegister.name,
        currentCacheBalance: sourceAccountRegister.balance,
        projectedBalanceAtDate: projectedBalance,
        targetDate: lastAt.toISOString().split("T")[0],
        minBalance,
      }
    );

    // Find the highest priority debt account (lowest balance, highest sort order)
    const allAccounts = this.cache.accountRegister.find({});
    const debtAccounts = this.cache.accountRegister.find(
      (account) => account.balance < 0
    ); // Must be negative (debt)

    forecastLogger.serviceDebug(
      "TransferService",
      `Extra debt payment account search:`,
      {
        totalAccounts: allAccounts.length,
        debtAccounts: debtAccounts.length,
        sourceAccountId: sourceAccountRegister.id,
        sourceAccountBalance: sourceAccountRegister.accountId,
        allAccountBalances: allAccounts
          .map((a) => ({ id: a.id, name: a.name, balance: a.balance }))
          .slice(0, 10),
      }
    );

    if (debtAccounts.length === 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment: No debt accounts found`
      );
      return false;
    }

    // Sort by loan payment sort order (lower values first) then by balance (most negative first)
    const sortedDebtAccounts = debtAccounts.sort((a, b) => {
      // First sort by loanPaymentSortOrder (lower values first)
      if (a.loanPaymentSortOrder !== b.loanPaymentSortOrder) {
        return a.loanPaymentSortOrder - b.loanPaymentSortOrder;
      }
      // Then by balance (most negative first)
      return a.balance - b.balance;
    });

    // Calculate available amount above minimum balance using PROJECTED balance
    let remainingAvailableAmount = projectedBalance - minBalance;

    forecastLogger.serviceDebug(
      "TransferService",
      `Extra debt payment check:`,
      {
        sourceAccountId: sourceAccountRegister.id,
        sourceAccountName: sourceAccountRegister.name,
        currentCacheBalance: sourceAccountRegister.balance,
        projectedBalance,
        minBalance,
        totalAvailableAmount: remainingAvailableAmount,
        debtAccountsFound: sortedDebtAccounts.length,
        date: lastAt.toISOString().split("T")[0],
      }
    );

    // Ensure we don't transfer if it would bring the source account below minimum
    if (remainingAvailableAmount <= 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment: Available amount (${remainingAvailableAmount}) <= 0, skipping`
      );
      return false;
    }

    // Additional safety check: ensure projected balance is positive
    if (projectedBalance <= 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment: Projected balance (${projectedBalance}) <= 0, skipping`
      );
      return false;
    }

    let totalPaymentsMade = 0;
    let paymentsProcessed = 0;

    // Pay debts in priority order until all available funds are used
    for (const debtAccountRegister of sortedDebtAccounts) {
      if (remainingAvailableAmount <= 0) {
        break; // No more funds available
      }

      let paymentAmount = remainingAvailableAmount;

      // Don't pay more than the debt balance
      if (paymentAmount > Math.abs(debtAccountRegister.balance)) {
        paymentAmount = Math.abs(debtAccountRegister.balance);
      }

      // Skip if no payment needed (debt is already paid off)
      if (paymentAmount <= 0) {
        continue;
      }

      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment to ${debtAccountRegister.name}:`,
        {
          debtAccountId: debtAccountRegister.id,
          debtAccountName: debtAccountRegister.name,
          debtBalance: debtAccountRegister.balance,
          paymentAmount,
          remainingAvailableAmount,
        }
      );

      // Execute the transfer with the correct forecast date
      this.transferBetweenAccountsWithDate({
        targetAccountRegisterId: debtAccountRegister.id,
        sourceAccountRegisterId: sourceAccountRegister.id,
        amount: paymentAmount,
        description: `Extra debt payment from ${sourceAccountRegister.name}`,
        fromDescription: `Debt Payment to ${debtAccountRegister.name}`,
        forecastDate: lastAt, // Use the actual forecast date being processed
        reoccurrence: {
          accountId: "",
          accountRegisterId: debtAccountRegister.id,
          description: `Extra debt payment from ${sourceAccountRegister.name}`,
          lastAt: dateTimeService.nowDate(), // Use current date for reoccurrence persistence
          amount: Number(paymentAmount),
          transferAccountRegisterId:
            debtAccountRegister.targetAccountRegisterId,
          intervalId: 3,
          intervalCount: 1,
          id: 0,
          endAt: null,
          totalIntervals: null,
          elapsedIntervals: null,
          updatedAt: dateTimeService.nowDate(),
          adjustBeforeIfOnWeekend: false,
        },
      });

      // Update remaining available amount
      remainingAvailableAmount -= paymentAmount;
      totalPaymentsMade += paymentAmount;
      paymentsProcessed++;
    }

    forecastLogger.serviceDebug(
      "TransferService",
      `Extra debt payment summary:`,
      {
        totalPaymentsMade,
        paymentsProcessed,
        remainingAvailableAmount,
        originalAvailableAmount: projectedBalance - minBalance,
      }
    );

    return paymentsProcessed > 0;
  }

  findDebtAccounts(): CacheAccountRegister[] {
    return this.cache.accountRegister.find((account) => account.balance < 0);
  }

  findExtraPaymentAccounts(): CacheAccountRegister[] {
    return this.cache.accountRegister.find(
      (account) => account.allowExtraPayment
    );
  }

  /**
   * Process savings goals after all debt is paid
   * Uses savingsGoalSortOrder for priority and accountSavingsGoal for target amounts
   */
  async processSavingsGoals(
    sourceAccounts: CacheAccountRegister[],
    targetDate: Date
  ): Promise<void> {
    forecastLogger.service(
      "TransferService",
      `Processing savings goals for date: ${
        targetDate.toISOString().split("T")[0]
      }`
    );

    // Check if there are any debt accounts with negative balances
    const debtAccounts = this.findDebtAccounts();

    if (debtAccounts.length > 0) {
      forecastLogger.service(
        "TransferService",
        `Skipping savings goals - ${debtAccounts.length} debt accounts still have balances`
      );
      return;
    }

    forecastLogger.service(
      "TransferService",
      `All debt paid! Processing savings goals...`
    );

    // Process each source account that allows extra payments
    for (const sourceAccount of sourceAccounts) {
      if (!this.shouldProcessExtraDebtPayment(sourceAccount, targetDate)) {
        continue;
      }

      await this.processSavingsGoalForAccount({
        sourceAccountId: sourceAccount.id,
        targetDate,
      });
    }
  }

  /**
   * Process savings goals for a specific source account
   */
  private async processSavingsGoalForAccount({
    sourceAccountId,
    targetDate,
  }: {
    sourceAccountId: number;
    targetDate: Date;
  }): Promise<boolean> {
    const sourceAccountRegister = this.cache.accountRegister.findOne({
      id: sourceAccountId,
    });

    if (!sourceAccountRegister) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Savings goal: Source account ${sourceAccountId} not found`
      );
      return false;
    }

    // Calculate the projected balance at the forecast date
    const projectedBalance = this.calculateProjectedBalanceAtDate(
      sourceAccountId,
      targetDate
    );

    forecastLogger.serviceDebug(
      "TransferService",
      `Savings goal projected balance check:`,
      {
        sourceAccountId: sourceAccountRegister.id,
        sourceAccountName: sourceAccountRegister.name,
        currentCacheBalance: sourceAccountRegister.balance,
        projectedBalanceAtDate: projectedBalance,
        targetDate: targetDate.toISOString().split("T")[0],
        minBalance: sourceAccountRegister.minAccountBalance,
      }
    );

    // Find all savings goal accounts (accounts with accountSavingsGoal set)
    const allAccounts = this.cache.accountRegister.find({});
    const savingsGoalAccounts = this.cache.accountRegister.find(
      (account) => (account.accountSavingsGoal ?? 0) > 0
    );

    forecastLogger.serviceDebug(
      "TransferService",
      `Savings goal account search:`,
      {
        totalAccounts: allAccounts.length,
        savingsGoalAccountsCount: savingsGoalAccounts.length,
        sourceAccountId: sourceAccountRegister.id,
        sourceAccountBalance: sourceAccountRegister.balance,
        savingsGoalAccounts: savingsGoalAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          balance: a.balance,
          savingsGoal: a.accountSavingsGoal,
          savingsGoalSortOrder: a.savingsGoalSortOrder,
        })),
      }
    );

    if (savingsGoalAccounts.length === 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Savings goal: No savings goal accounts found`
      );
      return false;
    }

    // Sort by savings goal sort order (lower values first) then by remaining goal amount
    const sortedSavingsGoalAccounts = savingsGoalAccounts.sort((a, b) => {
      // First sort by savingsGoalSortOrder (lower values first)
      if (a.savingsGoalSortOrder !== b.savingsGoalSortOrder) {
        return a.savingsGoalSortOrder - b.savingsGoalSortOrder;
      }
      // Then by remaining goal amount (highest remaining first)
      const aRemaining = (a.accountSavingsGoal || 0) - a.balance;
      const bRemaining = (b.accountSavingsGoal || 0) - b.balance;
      return bRemaining - aRemaining;
    });

    // Calculate available amount above minimum balance using PROJECTED balance
    let remainingAvailableAmount =
      projectedBalance - Number(sourceAccountRegister.minAccountBalance);

    // Ensure we don't transfer if it would bring the source account below minimum
    if (remainingAvailableAmount <= 0) {
      return false;
    }

    // Additional safety check: ensure projected balance is positive
    if (projectedBalance <= 0) {
      return false;
    }

    let totalSavingsMade = 0;
    let savingsProcessed = 0;

    // Fund savings goals in priority order until all available funds are used
    for (const savingsAccountRegister of sortedSavingsGoalAccounts) {
      if (remainingAvailableAmount <= 0) {
        break; // No more funds available
      }

      // Calculate how much more is needed to reach the savings goal
      const currentBalance = savingsAccountRegister.balance;
      const savingsGoal = savingsAccountRegister.accountSavingsGoal || 0;
      const remainingToGoal = savingsGoal - currentBalance;

      if (remainingToGoal <= 0) {
        continue; // This savings goal is already reached
      }

      let savingsAmount = Math.min(remainingAvailableAmount, remainingToGoal);

      // Execute the transfer with the correct forecast date
      this.transferBetweenAccountsWithDate({
        targetAccountRegisterId: savingsAccountRegister.id,
        sourceAccountRegisterId: sourceAccountRegister.id,
        amount: savingsAmount,
        description: `Savings goal contribution from ${sourceAccountRegister.name}`,
        forecastDate: targetDate,
      });

      // Update remaining available amount
      remainingAvailableAmount -= savingsAmount;
      totalSavingsMade += savingsAmount;
      savingsProcessed++;
    }

    forecastLogger.serviceDebug("TransferService", `Savings goal summary:`, {
      totalSavingsMade,
      savingsProcessed,
      remainingAvailableAmount,
      originalAvailableAmount:
        projectedBalance - Number(sourceAccountRegister.minAccountBalance),
    });

    return savingsProcessed > 0;
  }
}
