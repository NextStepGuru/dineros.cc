import type { ITransferService, TransferParams } from "./types";
import type { CacheAccountRegister, ModernCacheService  } from "./ModernCacheService";
import prismaPkg, { AmountAdjustmentMode } from "@prisma/client";
import type { RegisterEntryService } from "./RegisterEntryService";
import { forecastLogger } from "./logger";
import { dateTimeService } from "./DateTimeService";
import { getProjectedBalanceAtDate } from "./getProjectedBalanceAtDate";

const { Prisma } = prismaPkg;

export class TransferService implements ITransferService {
  private static readonly MONEY_EPSILON = 0.005; // half-cent tolerance
  private readonly cache: ModernCacheService;
  private readonly entryService: RegisterEntryService;

  constructor(cache: ModernCacheService, entryService: RegisterEntryService) {
    this.cache = cache;
    this.entryService = entryService;
  }

  transferBetweenAccounts(params: TransferParams): void {
    const {
      targetAccountRegisterId,
      sourceAccountRegisterId,
      amount,
      description,
      reoccurrence,
      fromDescription,
      categoryId: transferCategoryId,
    } = params;

    // Cap transfer to debt account so payment never exceeds balance
    let effectiveAmount = Math.abs(+amount);
    const targetForCap = this.cache.accountRegister.findById(targetAccountRegisterId);
    if (targetForCap && +targetForCap.balance < 0) {
      const amountOwed = Math.abs(+targetForCap.balance);
      if (effectiveAmount > amountOwed) effectiveAmount = amountOwed;
    }
    if (effectiveAmount <= TransferService.MONEY_EPSILON) return;

    // Create entry for target account (receiving money)
    this.entryService.createEntry({
      accountRegisterId: targetAccountRegisterId,
      description,
      sourceAccountRegisterId,
      amount: effectiveAmount,
      reoccurrence,
      typeId: 6, // Transfer
      categoryId: null,
    });

    // Create entry for source account (sending money)
    this.entryService.createEntry({
      accountRegisterId: sourceAccountRegisterId,
      sourceAccountRegisterId: targetAccountRegisterId,
      description: fromDescription || `Transfer for ${description}`,
      amount: effectiveAmount * -1,
      reoccurrence,
      typeId: 6, // Transfer
      categoryId: transferCategoryId ?? null,
    });
  }

  transferBetweenAccountsWithDate(
    params: TransferParams & { forecastDate: Date },
  ): void {
    const {
      targetAccountRegisterId,
      sourceAccountRegisterId,
      amount,
      description,
      reoccurrence,
      fromDescription,
      forecastDate,
      categoryId: transferCategoryIdWithDate,
    } = params;

    // Cap transfer to debt account so payment never exceeds balance
    let effectiveAmount = Math.abs(+amount);
    const targetForCap = this.cache.accountRegister.findById(targetAccountRegisterId);
    if (targetForCap && +targetForCap.balance < 0) {
      const amountOwed = Math.abs(+targetForCap.balance);
      if (effectiveAmount > amountOwed) effectiveAmount = amountOwed;
    }
    if (effectiveAmount <= TransferService.MONEY_EPSILON) {
      return;
    }

    // Create entry for target account (receiving money)
    this.entryService.createEntry({
      accountRegisterId: targetAccountRegisterId,
      description,
      sourceAccountRegisterId,
      amount: effectiveAmount,
      reoccurrence,
      forecastDate,
      typeId: 6, // Transfer
      categoryId: null,
    });

    // Create entry for source account (sending money)
    this.entryService.createEntry({
      accountRegisterId: sourceAccountRegisterId,
      sourceAccountRegisterId: targetAccountRegisterId,
      description: fromDescription || `Transfer for ${description}`,
      amount: effectiveAmount * -1,
      reoccurrence,
      forecastDate,
      typeId: 6, // Transfer
      categoryId: transferCategoryIdWithDate ?? null,
    });
  }

  async processExtraDebtPayments(
    sourceAccounts: CacheAccountRegister[],
    targetDate: Date,
  ): Promise<void> {
    const dayOfMonth = dateTimeService.createUTC(targetDate).date() as number;
    if (dayOfMonth !== 1 && dayOfMonth !== 2 && dayOfMonth !== 3) {
      return;
    }

    // Log which accounts have extra payment enabled
    const extraPaymentAccounts = sourceAccounts.filter(
      (acc) => acc.allowExtraPayment === true,
    );
    if (extraPaymentAccounts.length === 0) {
      return;
    }

    if (extraPaymentAccounts.length > 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Found ${extraPaymentAccounts.length} accounts with allowExtraPayment=true:`,
        extraPaymentAccounts.map((acc) => ({
          id: acc.id,
          name: acc.name,
          balance: acc.balance,
          minBalance: acc.minAccountBalance,
        })),
      );
    }

    for (const sourceAccount of sourceAccounts) {
      const shouldProcess = this.shouldProcessExtraDebtPaymentOnDate(
        sourceAccount,
        targetDate,
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
    targetDate?: Date,
  ): boolean {
    // If targetDate is provided, calculate projected balance at that date
    let balanceToUse = account.balance;
    if (targetDate) {
      balanceToUse = this.calculateProjectedBalanceAtDate(
        account.id,
        targetDate,
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
    const finalEligible =
      isEligible && excessAmount > TransferService.MONEY_EPSILON;

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
        },
      );
    }

    return finalEligible;
  }

  private shouldProcessExtraDebtPaymentOnDate(
    account: CacheAccountRegister,
    targetDate: Date,
  ): boolean {
    // First check basic eligibility using projected balance at target date
    if (!this.shouldProcessExtraDebtPayment(account, targetDate)) {
      return false;
    }

    // Process on 1st of month, or if it's a weekend/holiday, process on next business day
    const dayOfMonth = dateTimeService.createUTC(targetDate).date() as number;
    const shouldProcess =
      dayOfMonth === 1 || dayOfMonth === 2 || dayOfMonth === 3; // Allow 1st, 2nd, or 3rd to handle weekends/holidays

    return shouldProcess;
  }

  private calculateProjectedBalanceAtDate(
    accountId: number,
    targetDate: Date,
  ): number {
    const targetEpoch = dateTimeService.endOfDay(targetDate).valueOf();
    const entries = this.cache.registerEntry.find({ accountRegisterId: accountId });
    const ledgerProjected = entries
      .filter((e) => {
        const entryEpoch = dateTimeService.toDate(e.createdAt as any).getTime();
        return Number.isFinite(entryEpoch) && entryEpoch <= targetEpoch;
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);
    return ledgerProjected;
  }

  /**
   * Minimum projected balance over [fromDate - daysBack, fromDate + daysForward] (inclusive).
   * Used so extra debt payment never drives the account below min in that window.
   * For the fromDate day (offset 0), todayBalanceOverride is used when provided.
   */
  private getMinProjectedBalanceInWindow(
    accountId: number,
    fromDate: Date,
    daysBack: number,
    daysForward: number,
    todayBalanceOverride?: number,
  ): number {
    let minBalance = Number.POSITIVE_INFINITY;
    const start = -daysBack;
    const end = daysForward;
    for (let d = start; d <= end; d++) {
      const day = dateTimeService.toDate(
        dateTimeService.startOfDay(dateTimeService.add(d, "day", fromDate)),
      );
      const balanceAtDay = getProjectedBalanceAtDate(
        this.cache,
        accountId,
        day,
      );
      const effectiveBalance =
        d === 0 && todayBalanceOverride !== undefined
          ? Math.min(todayBalanceOverride, balanceAtDay)
          : balanceAtDay;
      if (effectiveBalance < minBalance) minBalance = effectiveBalance;
    }
    if (!Number.isFinite(minBalance)) {
      return todayBalanceOverride ?? 0;
    }
    return minBalance;
  }

  /**
   * Minimum projected balance over today and the next 7 days (inclusive).
   * Single pass over entries: fetch once, compute balance at each day end, return min.
   */
  private getMinProjectedBalanceOverNext7Days(
    accountId: number,
    fromDate: Date,
    todayBalanceOverride?: number,
  ): number {
    return this.getMinProjectedBalanceInWindow(
      accountId,
      fromDate,
      0,
      7,
      todayBalanceOverride,
    );
  }

  private static sortDebtAccountsByPaymentPriority(
    accounts: CacheAccountRegister[],
  ): CacheAccountRegister[] {
    return [...accounts].sort((a, b) => {
      if (a.loanPaymentSortOrder !== b.loanPaymentSortOrder) {
        return a.loanPaymentSortOrder - b.loanPaymentSortOrder;
      }
      return a.balance - b.balance;
    });
  }

  private tryResolveExtraDebtAvailability(
    minBalance: number,
    sourceAccountId: number,
    lastAt: Date,
  ): {
    sourceAccountRegister: CacheAccountRegister;
    projectedBalance: number;
    balanceBeforeExtraDebt: number;
    todayCushion: number;
    remainingAvailableAmount: number;
  } | null {
    const sourceAccountRegister = this.cache.accountRegister.findOne({
      id: sourceAccountId,
    });

    if (!sourceAccountRegister) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment: Source account ${sourceAccountId} not found`,
      );
      return null;
    }

    const projectedBalance = this.calculateProjectedBalanceAtDate(
      sourceAccountId,
      lastAt,
    );
    const cacheBalanceNow = sourceAccountRegister.balance;
    const balanceBeforeExtraDebt = Math.min(projectedBalance, cacheBalanceNow);
    const todayCushion = Math.max(0, balanceBeforeExtraDebt - minBalance);

    const minBalanceInWindow = this.getMinProjectedBalanceInWindow(
      sourceAccountId,
      lastAt,
      7,
      90,
      balanceBeforeExtraDebt,
    );
    let remainingAvailableAmount = Math.max(
      0,
      minBalanceInWindow - minBalance,
    );
    remainingAvailableAmount = Math.min(remainingAvailableAmount, todayCushion);

    if (
      balanceBeforeExtraDebt < minBalance ||
      remainingAvailableAmount <= TransferService.MONEY_EPSILON
    ) {
      return null;
    }

    return {
      sourceAccountRegister,
      projectedBalance,
      balanceBeforeExtraDebt,
      todayCushion,
      remainingAvailableAmount,
    };
  }

  private shouldAbortExtraDebtForLowFunds(
    remainingAvailableAmount: number,
    projectedBalance: number,
  ): boolean {
    if (remainingAvailableAmount <= TransferService.MONEY_EPSILON) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment: Available amount (${remainingAvailableAmount}) <= 0, skipping`,
      );
      return true;
    }
    if (projectedBalance <= 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment: Projected balance (${projectedBalance}) <= 0, skipping`,
      );
      return true;
    }
    return false;
  }

  /** Resolves payment slice for one debt account, or signals to skip / stop the outer loop. */
  private resolveExtraDebtPaymentForAccount(params: {
    debtAccountRegister: CacheAccountRegister;
    remainingAvailableAmount: number;
    balanceBeforeExtraDebt: number;
    totalPaymentsMade: number;
    minBalance: number;
    todayCushion: number;
  }):
    | { kind: "pay"; paymentAmount: number; debtBalance: number }
    | { kind: "skip" }
    | { kind: "break" } {
    const {
      debtAccountRegister,
      remainingAvailableAmount,
      balanceBeforeExtraDebt,
      totalPaymentsMade,
      minBalance,
      todayCushion,
    } = params;

    const currentBalance = balanceBeforeExtraDebt - totalPaymentsMade;
    const maxFromCurrentBalance = Math.max(0, currentBalance - minBalance);
    if (maxFromCurrentBalance <= TransferService.MONEY_EPSILON) {
      return { kind: "break" };
    }

    const freshDebt = this.cache.accountRegister.findById(
      debtAccountRegister.id,
    );
    const debtBalance = freshDebt
      ? +freshDebt.balance
      : +debtAccountRegister.balance;
    if (debtBalance >= 0) {
      return { kind: "skip" };
    }

    const amountOwed = Math.abs(debtBalance);
    let paymentAmount = remainingAvailableAmount;
    if (paymentAmount > amountOwed) {
      paymentAmount = amountOwed;
    }
    if (paymentAmount > maxFromCurrentBalance) {
      paymentAmount = maxFromCurrentBalance;
    }
    const remainingTodayCushion = Math.max(
      0,
      todayCushion - totalPaymentsMade,
    );
    if (paymentAmount > remainingTodayCushion) {
      paymentAmount = remainingTodayCushion;
    }
    if (paymentAmount <= TransferService.MONEY_EPSILON) {
      return { kind: "skip" };
    }

    return { kind: "pay", paymentAmount, debtBalance };
  }

  private runExtraDebtPaymentLoop(params: {
    sortedDebtAccounts: CacheAccountRegister[];
    sourceAccountRegister: CacheAccountRegister;
    balanceBeforeExtraDebt: number;
    minBalance: number;
    todayCushion: number;
    remainingAvailableAmount: number;
    lastAt: Date;
    projectedBalance: number;
  }): number {
    const {
      sortedDebtAccounts,
      sourceAccountRegister,
      balanceBeforeExtraDebt,
      minBalance,
      todayCushion,
      lastAt,
      projectedBalance,
    } = params;
    let remainingAvailableAmount = params.remainingAvailableAmount;

    let totalPaymentsMade = 0;
    let paymentsProcessed = 0;

    for (const debtAccountRegister of sortedDebtAccounts) {
      if (remainingAvailableAmount <= TransferService.MONEY_EPSILON) {
        break;
      }

      const resolved = this.resolveExtraDebtPaymentForAccount({
        debtAccountRegister,
        remainingAvailableAmount,
        balanceBeforeExtraDebt,
        totalPaymentsMade,
        minBalance,
        todayCushion,
      });

      if (resolved.kind === "break") {
        break;
      }
      if (resolved.kind === "skip") {
        continue;
      }

      const { paymentAmount, debtBalance } = resolved;

      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment to ${debtAccountRegister.name}:`,
        {
          debtAccountId: debtAccountRegister.id,
          debtAccountName: debtAccountRegister.name,
          debtBalance,
          paymentAmount,
          remainingAvailableAmount,
        },
      );

      this.transferBetweenAccountsWithDate({
        targetAccountRegisterId: debtAccountRegister.id,
        sourceAccountRegisterId: sourceAccountRegister.id,
        amount: paymentAmount,
        description: `Extra debt payment from ${sourceAccountRegister.name}`,
        fromDescription: `Debt Payment to ${debtAccountRegister.name}`,
        forecastDate: lastAt,
        categoryId: debtAccountRegister.paymentCategoryId ?? null,
        reoccurrence: {
          accountId: "",
          accountRegisterId: debtAccountRegister.id,
          description: `Extra debt payment from ${sourceAccountRegister.name}`,
          lastAt: dateTimeService.nowDate(),
          amount: new Prisma.Decimal(Number(paymentAmount)),
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
          categoryId: null,
          amountAdjustmentMode: AmountAdjustmentMode.NONE,
          amountAdjustmentDirection: null,
          amountAdjustmentValue: null,
          amountAdjustmentIntervalId: null,
          amountAdjustmentIntervalCount: 1,
          amountAdjustmentAnchorAt: null,
        },
      });
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
      },
    );
    return paymentsProcessed;
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
    const avail = this.tryResolveExtraDebtAvailability(
      minBalance,
      sourceAccountId,
      lastAt,
    );
    if (!avail) {
      return false;
    }

    const {
      sourceAccountRegister,
      projectedBalance,
      balanceBeforeExtraDebt,
      todayCushion,
      remainingAvailableAmount,
    } = avail;

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
      },
    );

    const debtAccounts = this.cache.accountRegister.find(
      (account) => account.balance < 0,
    );

    forecastLogger.serviceDebug(
      "TransferService",
      `Extra debt payment account search:`,
      {
        debtAccounts: debtAccounts.length,
        sourceAccountId: sourceAccountRegister.id,
        sourceAccountBalance: sourceAccountRegister.accountId,
      },
    );

    if (debtAccounts.length === 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Extra debt payment: No debt accounts found`,
      );
      return false;
    }

    const sortedDebtAccounts =
      TransferService.sortDebtAccountsByPaymentPriority(debtAccounts);

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
      },
    );

    if (
      this.shouldAbortExtraDebtForLowFunds(
        remainingAvailableAmount,
        projectedBalance,
      )
    ) {
      return false;
    }

    const paymentsProcessed = this.runExtraDebtPaymentLoop({
      sortedDebtAccounts,
      sourceAccountRegister,
      balanceBeforeExtraDebt,
      minBalance,
      todayCushion,
      remainingAvailableAmount,
      lastAt,
      projectedBalance,
    });

    return paymentsProcessed > 0;
  }

  findDebtAccounts(): CacheAccountRegister[] {
    return this.cache.accountRegister.find((account) => account.balance < 0);
  }

  findExtraPaymentAccounts(): CacheAccountRegister[] {
    return this.cache.accountRegister.find(
      (account) => account.allowExtraPayment,
    );
  }

  getAccountBalance(accountRegisterId: number): number {
    const account = this.cache.accountRegister.findById(accountRegisterId);
    return account?.balance || 0;
  }

  /**
   * Process high-priority savings goals (priorityOverDebt = true) before extra debt payments.
   * Runs on 1st–3rd of month. Each goal pulls from its source account into its target register.
   */
  async processHighPriorityGoals(
    sourceAccounts: CacheAccountRegister[],
    targetDate: Date,
  ): Promise<void> {
    const dayOfMonth = dateTimeService.createUTC(targetDate).date() as number;
    if (dayOfMonth !== 1 && dayOfMonth !== 2 && dayOfMonth !== 3) {
      return;
    }

    for (const sourceAccount of sourceAccounts) {
      const goals = this.cache.savingsGoal.find(
        (g) =>
          g.sourceAccountRegisterId === sourceAccount.id &&
          g.priorityOverDebt === true,
      );
      if (goals.length === 0) continue;

      const sorted = [...goals].sort((a, b) => a.sortOrder - b.sortOrder);
      let projectedBalance = this.calculateProjectedBalanceAtDate(
        sourceAccount.id,
        targetDate,
      );
      const sourceMinBalance = Number(sourceAccount.minAccountBalance ?? 0);

      for (const goal of sorted) {
        const available = goal.ignoreMinBalance
          ? projectedBalance
          : Math.max(0, projectedBalance - sourceMinBalance);
        if (available <= TransferService.MONEY_EPSILON) break;

        const targetProjected = this.calculateProjectedBalanceAtDate(
          goal.targetAccountRegisterId,
          targetDate,
        );
        const remainingToGoal = Math.max(
          0,
          goal.targetAmount - targetProjected,
        );
        if (remainingToGoal <= TransferService.MONEY_EPSILON) continue;

        const amount = Math.min(available, remainingToGoal);
        this.transferBetweenAccountsWithDate({
          targetAccountRegisterId: goal.targetAccountRegisterId,
          sourceAccountRegisterId: sourceAccount.id,
          amount,
          description: `Goal: ${goal.name}`,
          forecastDate: targetDate,
        });

        projectedBalance -= amount;
      }
    }
  }

  /**
   * Process savings goals after all debt is paid
   * Uses savingsGoalSortOrder for priority and accountSavingsGoal for target amounts;
   * also processes SavingsGoal records with priorityOverDebt = false.
   */
  async processSavingsGoals(
    sourceAccounts: CacheAccountRegister[],
    targetDate: Date,
  ): Promise<void> {
    forecastLogger.service(
      "TransferService",
      `Processing savings goals for date: ${
        targetDate.toISOString().split("T")[0]
      }`,
    );

    // Check if there are any debt accounts with negative balances
    const debtAccounts = this.findDebtAccounts();

    if (debtAccounts.length > 0) {
      forecastLogger.service(
        "TransferService",
        `Skipping savings goals - ${debtAccounts.length} debt accounts still have balances`,
      );
      return;
    }

    forecastLogger.service(
      "TransferService",
      `All debt paid! Processing savings goals...`,
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
        `Savings goal: Source account ${sourceAccountId} not found`,
      );
      return false;
    }

    // Calculate the projected balance at the forecast date
    const projectedBalance = this.calculateProjectedBalanceAtDate(
      sourceAccountId,
      targetDate,
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
      },
    );

    const savingsGoalAccounts = this.cache.accountRegister.find(
      (account) => (account.accountSavingsGoal ?? 0) > 0,
    );

    const normalGoals = this.cache.savingsGoal.find(
      (g) =>
        g.sourceAccountRegisterId === sourceAccountId &&
        g.priorityOverDebt === false,
    );

    type FundingTarget = {
      targetRegisterId: number;
      remainingToGoal: number;
      sortOrder: number;
      description: string;
    };

    const targets: FundingTarget[] = [];

    for (const a of savingsGoalAccounts) {
      const targetProj = this.calculateProjectedBalanceAtDate(a.id, targetDate);
      const remaining = Math.max(0, (a.accountSavingsGoal ?? 0) - targetProj);
      if (remaining > TransferService.MONEY_EPSILON) {
        targets.push({
          targetRegisterId: a.id,
          remainingToGoal: remaining,
          sortOrder: a.savingsGoalSortOrder,
          description: `Savings goal contribution from ${sourceAccountRegister.name}`,
        });
      }
    }

    for (const g of normalGoals) {
      const targetProj = this.calculateProjectedBalanceAtDate(
        g.targetAccountRegisterId,
        targetDate,
      );
      const remaining = Math.max(0, g.targetAmount - targetProj);
      if (remaining > TransferService.MONEY_EPSILON) {
        targets.push({
          targetRegisterId: g.targetAccountRegisterId,
          remainingToGoal: remaining,
          sortOrder: g.sortOrder,
          description: `Goal: ${g.name}`,
        });
      }
    }

    targets.sort((a, b) => a.sortOrder - b.sortOrder);

    forecastLogger.serviceDebug(
      "TransferService",
      `Savings goal targets:`,
      {
        savingsGoalAccountsCount: savingsGoalAccounts.length,
        normalGoalsCount: normalGoals.length,
        targetsCount: targets.length,
        sourceAccountId: sourceAccountRegister.id,
      },
    );

    if (targets.length === 0) {
      forecastLogger.serviceDebug(
        "TransferService",
        `Savings goal: No targets to fund`,
      );
      return false;
    }

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

    for (const t of targets) {
      if (remainingAvailableAmount <= 0) break;

      const amount = Math.min(remainingAvailableAmount, t.remainingToGoal);
      this.transferBetweenAccountsWithDate({
        targetAccountRegisterId: t.targetRegisterId,
        sourceAccountRegisterId: sourceAccountRegister.id,
        amount,
        description: t.description,
        forecastDate: targetDate,
      });

      remainingAvailableAmount -= amount;
      totalSavingsMade += amount;
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
