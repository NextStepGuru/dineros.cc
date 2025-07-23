import moment from "moment";
import type { PrismaClient } from "@prisma/client";
import type { IAccountRegisterService } from "./types";
import type { CacheAccountRegister } from "./ModernCacheService";
import { ModernCacheService } from "./ModernCacheService";
import { LoanCalculatorService } from "./LoanCalculatorService";
import { RegisterEntryService } from "./RegisterEntryService";
import { TransferService } from "./TransferService";
import { dateTimeService } from "./DateTimeService";

export class AccountRegisterService implements IAccountRegisterService {
  constructor(
    private db: PrismaClient,
    private cache: ModernCacheService,
    private loanCalculator: LoanCalculatorService,
    private entryService: RegisterEntryService,
    private transferService: TransferService
  ) {}

  updateBalance(accountId: number, amount: number): void {
    const account = this.cache.accountRegister.findOne({
      id: accountId,
    });

    if (account) {
      account.balance += amount;
      this.cache.accountRegister.update(account);
    }
  }

  getAccount(accountId: number): CacheAccountRegister | null {
    return this.cache.accountRegister.findOne({
      id: accountId,
    });
  }

  async processInterestCharges(
    accounts: CacheAccountRegister[],
    forecastDate?: moment.Moment
  ): Promise<void> {
    const interestAccounts = accounts.filter((account) =>
      this.loanCalculator.shouldProcessInterest(account, forecastDate)
    );

    for (const account of interestAccounts) {
      await this.processAccountInterestCharge(account, forecastDate);
    }
  }

  private async processAccountInterestCharge(
    accountRegister: CacheAccountRegister,
    forecastDate?: moment.Moment
  ): Promise<void> {
    // Calculate projected balance at the statement date for more accurate interest calculation
    const statementDate = forecastDate?.toDate() || dateTimeService.nowDate();
    const projectedBalance = this.calculateProjectedBalanceAtDate(
      accountRegister.id,
      statementDate
    );

    const interest = await this.loanCalculator.calculateInterestForAccount(
      accountRegister,
      projectedBalance
    );

    // Skip if no interest
    if (interest === 0) {
      return;
    }

    const isCreditAccount = this.loanCalculator.isCreditAccount(accountRegister.typeId);
    const description = isCreditAccount ? "Interest Charge" : "Interest Earned";
    const intervalId = accountRegister.statementIntervalId;

    // Create interest entry
    this.entryService.createEntry({
      accountRegisterId: accountRegister.id,
      description: description,
      sourceAccountRegisterId:
        accountRegister.targetAccountRegisterId || undefined,
      amount: Math.abs(interest),
      forecastDate: forecastDate?.toDate(), // Use forecast date for proper timeline placement
      reoccurrence: {
        accountId: "",
        accountRegisterId: accountRegister.id,
        description: accountRegister.name,
        lastAt: dateTimeService.nowDate(), // Use current date for reoccurrence persistence
        amount: Math.abs(interest),
        transferAccountRegisterId: accountRegister.targetAccountRegisterId,
        intervalId: intervalId,
        intervalCount: 1,
        id: 0,
        endAt: null,
        totalIntervals: null,
        elapsedIntervals: null,
        updatedAt: dateTimeService.nowDate(),
        adjustBeforeIfOnWeekend: false,
      },
    });

    // For credit accounts, also process minimum payments
    if (isCreditAccount) {
      const payment = this.loanCalculator.calculatePaymentAmount(
        accountRegister,
        Math.abs(interest)
      );

      if (payment > 0) {
        // Process payment
        if (accountRegister.targetAccountRegisterId) {
          // Transfer from target account to pay this debt
          this.transferService.transferBetweenAccountsWithDate({
            targetAccountRegisterId: accountRegister.id,
            sourceAccountRegisterId: accountRegister.targetAccountRegisterId,
            amount: payment,
            description: `Min Payment to ${accountRegister.name}`,
            forecastDate: forecastDate?.toDate() || dateTimeService.nowDate(), // Use forecast date for proper timeline placement
            reoccurrence: {
              accountId: "",
              accountRegisterId: accountRegister.id,
              description: `Min Payment to ${accountRegister.name}`,
              lastAt: dateTimeService.nowDate(), // Use current date for reoccurrence persistence
              amount: payment,
              transferAccountRegisterId: accountRegister.targetAccountRegisterId,
              intervalId: intervalId,
              intervalCount: 1,
              id: 0,
              endAt: null,
              totalIntervals: null,
              elapsedIntervals: null,
              updatedAt: dateTimeService.nowDate(),
              adjustBeforeIfOnWeekend: false,
            },
          });
        } else {
          // Direct payment entry
          this.entryService.createEntry({
            accountRegisterId: accountRegister.id,
            description: `Payment for ${accountRegister.name}`,
            amount: payment,
            forecastDate: forecastDate?.toDate(), // Use forecast date for proper timeline placement
          });
        }
      }
    }

    // Update statement date
    await this.updateStatementDate(accountRegister, forecastDate);
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
      .filter((entry) => {
        // Include entries that occur on or before the target date
        return entry.createdAt.isSameOrBefore(moment(targetDate));
      });

    // Start with the initial balance and add all entries up to target date
    let projectedBalance = account.latestBalance;

    // Add up all entries up to the target date (excluding balance entries)
    for (const entry of entries) {
      if (!entry.isBalanceEntry) {
        projectedBalance += entry.amount;
      }
    }

    return projectedBalance;
  }

  async updateStatementDates(
    accounts: CacheAccountRegister[],
    forecastDate?: moment.Moment
  ): Promise<void> {
    for (const account of accounts) {
      await this.updateStatementDate(account, forecastDate);
    }
  }

  private async updateStatementDate(
    accountRegister: CacheAccountRegister,
    forecastDate?: moment.Moment
  ): Promise<void> {
    const statementAt = moment(accountRegister.statementAt).utc();
    const comparisonDate = forecastDate
      ? forecastDate.utc().set({
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        })
      : dateTimeService.now().utc().set({
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        });

    const today = dateTimeService.now().utc().set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    });

    if (comparisonDate.isSameOrAfter(statementAt)) {
      // Calculate next statement date based on interval
      const newStatementAt = this.calculateNextStatementDate(
        statementAt,
        accountRegister.statementIntervalId
      );

      // Always update in-memory cache to continue forecast processing
      accountRegister.statementAt = moment(newStatementAt);
      this.cache.accountRegister.update(accountRegister);

      // Only persist to database if the comparison date is not in the future
      if (comparisonDate.isSameOrBefore(today)) {
        await this.db.accountRegister.update({
          where: { id: accountRegister.id },
          data: { statementAt: newStatementAt },
        });
      }
    }
  }

  private calculateNextStatementDate(
    currentStatementAt: moment.Moment,
    statementIntervalId: number
  ): Date {
    switch (statementIntervalId) {
      case 1: // Day
        return currentStatementAt.clone().add(1, 'day').toDate();
      case 2: // Week
        return currentStatementAt.clone().add(1, 'week').toDate();
      case 3: // Month
        return currentStatementAt.clone().add(1, 'month').toDate();
      case 4: // Year
        return currentStatementAt.clone().add(1, 'year').toDate();
      case 5: // Once (one-time)
        return currentStatementAt.clone().add(1, 'year').toDate(); // Default to yearly for one-time
      default:
        return currentStatementAt.clone().add(1, 'month').toDate(); // Default to monthly
    }
  }

  getAccountsByType(typeId: number): CacheAccountRegister[] {
    return this.cache.accountRegister.find({
      typeId: typeId,
    });
  }

  getInterestBearingAccounts(): CacheAccountRegister[] {
    const allAccounts = this.cache.accountRegister.find({});

    // Include accounts that either have a target account (for payments)
    // OR are savings accounts (typeId 2) that can earn interest directly
    const interestAccounts = this.cache.accountRegister.find(
      (account) =>
        account.balance !== 0 &&
        (account.targetAccountRegisterId !== null || account.typeId === 2)
    );

    return interestAccounts;
  }

  getAccountsWithExtraPayments(): CacheAccountRegister[] {
    return this.cache.accountRegister.find({
      allowExtraPayment: true,
    });
  }

  isAccountActive(account: CacheAccountRegister): boolean {
    return !account.isArchived;
  }

  filterActiveAccounts(
    accounts: CacheAccountRegister[]
  ): CacheAccountRegister[] {
    return accounts.filter((account) => this.isAccountActive(account));
  }

  createBalanceEntries(accounts: CacheAccountRegister[]): void {
    for (const account of accounts) {
      this.entryService.createBalanceEntry(account);
    }
  }
}
