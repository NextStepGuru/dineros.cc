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
      account.balance = +account.balance + +amount;
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
    forecastDate?: any
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
    forecastDate?: any
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

    const isCreditAccount = this.loanCalculator.isCreditAccount(
      accountRegister.typeId
    );
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

    // Update account balance with interest
    this.updateBalance(accountRegister.id, interest);

    // Update statement date to next cycle
    await this.updateStatementDate(accountRegister, forecastDate);
  }

  private calculateProjectedBalanceAtDate(
    accountId: number,
    targetDate: Date
  ): number {
    // Get all entries for this account up to the target date
    const entries = this.cache.registerEntry
      .find({
        accountRegisterId: accountId,
      })
      .filter((entry) => dateTimeService.isSameOrBefore(entry.createdAt, targetDate))
      .sort((a, b) => dateTimeService.diff(a.createdAt, b.createdAt));

    // Calculate running balance
    let balance = 0;
    for (const entry of entries) {
      balance += entry.amount;
    }

    return balance;
  }

  async updateStatementDates(
    accounts: CacheAccountRegister[],
    forecastDate?: any
  ): Promise<void> {
    console.log(
      `[updateStatementDates] Called with ${
        accounts.length
      } accounts, forecastDate: ${dateTimeService.format(forecastDate, "YYYY-MM-DD")}`
    );
    // Add a simple flag to track if method is called
    (global as any).updateStatementDatesCalled = true;
    (global as any).updateStatementDatesCallCount = ((global as any).updateStatementDatesCallCount || 0) + 1;
    for (const account of accounts) {
      await this.updateStatementDate(account, forecastDate);
    }
  }

  private async updateStatementDate(
    accountRegister: CacheAccountRegister,
    forecastDate?: any
  ): Promise<void> {
    // Normalize both dates to UTC and set to start of day for comparison
    const statementAt = dateTimeService.set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    }, dateTimeService.createUTC(accountRegister.statementAt));
    const comparisonDate = forecastDate
      ? dateTimeService.set({
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        }, dateTimeService.createUTC(forecastDate))
      : dateTimeService.set({
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        });

    const today = dateTimeService.set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    });

    console.log(`[updateStatementDate] Account ${accountRegister.id}:`);
    console.log(`  statementAt: ${dateTimeService.format(statementAt, "YYYY-MM-DD")}`);
    console.log(`  comparisonDate: ${dateTimeService.format(comparisonDate, "YYYY-MM-DD")}`);
    console.log(
      `  isSameOrAfter: ${dateTimeService.isSameOrAfter(comparisonDate, statementAt)}`
    );

    if (dateTimeService.isSameOrAfter(comparisonDate, statementAt)) {
      // Calculate next statement date based on interval
      const newStatementAt = this.calculateNextStatementDate(
        statementAt,
        accountRegister.statementIntervalId
      );

      // Always update in-memory cache to continue forecast processing
      accountRegister.statementAt = dateTimeService.create(newStatementAt);
      this.cache.accountRegister.update(accountRegister);

      // Only persist to database if the comparison date is not in the future
      if (dateTimeService.isSameOrBefore(comparisonDate, today)) {
        await this.db.accountRegister.update({
          where: { id: accountRegister.id },
          data: { statementAt: newStatementAt },
        });
      }
    }
  }

  private calculateNextStatementDate(
    currentStatementAt: any,
    statementIntervalId: number
  ): Date {
    switch (statementIntervalId) {
      case 1: // Day
        return dateTimeService.toDate(dateTimeService.add(1, "day", currentStatementAt));
      case 2: // Week
        return dateTimeService.toDate(dateTimeService.add(1, "week", currentStatementAt));
      case 3: // Month
        // For monthly, try to keep the same day of month
        const nextMonth = dateTimeService.add(1, "month", currentStatementAt);
        const originalDay = dateTimeService.date(currentStatementAt);
        const maxDay = dateTimeService.daysInMonth(nextMonth);
        const targetDay = Math.min(originalDay, maxDay);
        console.log(`[calculateNextStatementDate] Month calculation:`);
        console.log(`  originalDay: ${originalDay}`);
        console.log(`  maxDay: ${maxDay}`);
        console.log(`  targetDay: ${targetDay}`);
        console.log(`  nextMonth before date(): ${dateTimeService.format("YYYY-MM-DD", nextMonth)}`);
        console.log(`  nextMonth after date(): ${dateTimeService.format("YYYY-MM-DD", dateTimeService.setDate(targetDay, nextMonth))}`);
        return dateTimeService.toDate(dateTimeService.setDate(targetDay, nextMonth));
      case 4: // Year
        return dateTimeService.toDate(dateTimeService.add(1, "year", currentStatementAt));
      case 5: // Once (one-time)
        return dateTimeService.toDate(dateTimeService.add(1, "year", currentStatementAt)); // Default to yearly for one-time
      default:
        // For monthly, try to keep the same day of month
        const nextMonthDefault = dateTimeService.add(1, "month", currentStatementAt);
        const originalDayDefault = dateTimeService.date(currentStatementAt);
        const maxDayDefault = dateTimeService.daysInMonth(nextMonthDefault);
        const targetDayDefault = Math.min(originalDayDefault, maxDayDefault);
        return dateTimeService.toDate(dateTimeService.setDate(targetDayDefault, nextMonthDefault));
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
