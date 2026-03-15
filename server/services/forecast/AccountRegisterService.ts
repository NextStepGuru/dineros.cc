import type { PrismaClient } from "@prisma/client";
import type { IAccountRegisterService } from "./types";
import type { CacheAccountRegister } from "./ModernCacheService";
import { Decimal } from "@prisma/client/runtime/library";
import { ModernCacheService } from "./ModernCacheService";
import { LoanCalculatorService } from "./LoanCalculatorService";
import { RegisterEntryService } from "./RegisterEntryService";
import { TransferService } from "./TransferService";
import { dateTimeService } from "./DateTimeService";
import { getProjectedBalanceAtDate } from "./getProjectedBalanceAtDate";

export class AccountRegisterService implements IAccountRegisterService {
  private _pendingStatementAtUpdates: { id: number; statementAt: Date }[] = [];
  private cache: ModernCacheService;
  private loanCalculator: LoanCalculatorService;
  private entryService: RegisterEntryService;
  private transferService: TransferService;

  constructor(
    db: PrismaClient,
    cache: ModernCacheService,
    loanCalculator: LoanCalculatorService,
    entryService: RegisterEntryService,
    transferService: TransferService
  ) {
    void db;
    this.cache = cache;
    this.loanCalculator = loanCalculator;
    this.entryService = entryService;
    this.transferService = transferService;
  }

  getPendingStatementAtUpdates(): { id: number; statementAt: Date }[] {
    return [...this._pendingStatementAtUpdates];
  }

  clearPendingStatementAtUpdates(): void {
    this._pendingStatementAtUpdates = [];
  }

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
    // Process interest for each account, handling all missed statement dates
    for (const account of accounts) {
      // Continue processing interest while the current date is on or after the statement date
      while (this.loanCalculator.shouldProcessInterest(account, forecastDate)) {
        await this.processAccountInterestCharge(account, forecastDate);
      }
    }
  }

  private async processAccountInterestCharge(
    accountRegister: CacheAccountRegister,
    forecastDate?: any
  ): Promise<void> {
    // Calculate projected balance at the statement date for more accurate interest calculation
    const statementDate = forecastDate?.toDate() || dateTimeService.nowDate();
    const projectedBalance = getProjectedBalanceAtDate(
      this.cache,
      accountRegister.id,
      dateTimeService.toDate(statementDate)
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

    // Create interest entry with signed amount so running balance is correct for both
    // cleared and non-cleared paths (credit = negative = increases debt when added)
    this.entryService.createEntry({
      accountRegisterId: accountRegister.id,
      description: description,
      sourceAccountRegisterId:
        accountRegister.targetAccountRegisterId || undefined,
      amount: Number(interest),
      forecastDate: forecastDate?.toDate(), // Use forecast date for proper timeline placement
      typeId: isCreditAccount ? 2 : 3, // Interest Charge (2) or Interest Earned (3)
      reoccurrence: {
        accountId: "",
        accountRegisterId: accountRegister.id,
        description: accountRegister.name,
        lastAt: dateTimeService.nowDate(), // Use current date for reoccurrence persistence
        amount: new Decimal(Math.abs(interest)),
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
    this.updateBalance(accountRegister.id, Number(interest));

    // If there's a target account, create a transfer payment
    if (accountRegister.targetAccountRegisterId) {
      const paymentAmount = this.loanCalculator.calculatePaymentAmount(
        accountRegister,
        Math.abs(interest)
      );

      if (paymentAmount > 0) {
        this.transferService.transferBetweenAccountsWithDate({
          targetAccountRegisterId: accountRegister.id,
          sourceAccountRegisterId: accountRegister.targetAccountRegisterId,
          amount: Number(paymentAmount),
          description: `Payment to ${accountRegister.name}`,
          forecastDate: forecastDate?.toDate(),
          reoccurrence: {
            accountId: "",
            accountRegisterId: accountRegister.id,
            description: `Payment to ${accountRegister.name}`,
            lastAt: dateTimeService.nowDate(),
            amount: new Decimal(Number(paymentAmount)),
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
      }
    } else {
      // If there's no target account, create a direct payment entry
      const paymentAmount = this.loanCalculator.calculatePaymentAmount(
        accountRegister,
        Math.abs(interest)
      );

      if (paymentAmount > 0) {
        this.entryService.createEntry({
          accountRegisterId: accountRegister.id,
          description: `Payment for ${accountRegister.name}`,
          amount: Number(paymentAmount),
          forecastDate: forecastDate?.toDate(),
          typeId: 4, // Loan Payment
          reoccurrence: {
            accountId: "",
            accountRegisterId: accountRegister.id,
            description: `Payment for ${accountRegister.name}`,
            lastAt: dateTimeService.nowDate(),
            amount: new Decimal(Number(paymentAmount)),
            transferAccountRegisterId: null,
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
      }
    }

    // Update statement date to next cycle
    await this.updateStatementDate(accountRegister, forecastDate);
  }

  async updateStatementDates(
    accounts: CacheAccountRegister[],
    forecastDate?: any
  ): Promise<void> {
    // Add a simple flag to track if method is called
    (global as any).updateStatementDatesCalled = true;
    (global as any).updateStatementDatesCallCount =
      ((global as any).updateStatementDatesCallCount || 0) + 1;
    for (const account of accounts) {
      await this.updateStatementDate(account, forecastDate);
    }
  }

  private async updateStatementDate(
    accountRegister: CacheAccountRegister,
    forecastDate?: any
  ): Promise<void> {
    // Normalize both dates to UTC and set to start of day for comparison
    let statementAt = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.createUTC(accountRegister.statementAt)
    );
    const comparisonDate = forecastDate
      ? dateTimeService.set(
          {
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
          },
          dateTimeService.createUTC(forecastDate)
        )
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

    let updated = false;
    while (dateTimeService.isSameOrAfter(comparisonDate, statementAt)) {
      // Calculate next statement date based on interval
      const newStatementAt = this.calculateNextStatementDate(
        statementAt,
        accountRegister.statementIntervalId
      );
      // Always update in-memory cache to continue forecast processing
      // Handle both Date and Moment objects
      const statementAtMoment =
        typeof newStatementAt === "object" && newStatementAt._isAMomentObject
          ? newStatementAt
          : dateTimeService.create(newStatementAt);
      statementAt = statementAtMoment;
      accountRegister.statementAt = statementAtMoment;
      updated = true;
    }
    if (updated) {
      this.cache.accountRegister.update(accountRegister);
      if (dateTimeService.isSameOrBefore(comparisonDate, today)) {
        this._pendingStatementAtUpdates.push({
          id: accountRegister.id,
          statementAt: dateTimeService.toDate(statementAt),
        });
      }
    }
  }

  private calculateNextStatementDate(
    currentStatementAt: any,
    statementIntervalId: number
  ): any {
    switch (statementIntervalId) {
      case 1: { // Day
        // Use moment's add method directly to avoid any wrapper issues
        const dailyMoment = dateTimeService.create(currentStatementAt);
        const dailyNextDay = dailyMoment.add(1, "day");

        return dailyNextDay;
      }
      case 2: { // Week
        // Use moment's add method directly to avoid any wrapper issues
        const weeklyMoment = dateTimeService.create(currentStatementAt);
        const weeklyNextDay = weeklyMoment.add(1, "week");

        return weeklyNextDay;
      }
      case 3: { // Month
        // For monthly, manually construct the next month's date
        // Ensure we work in UTC to avoid timezone issues
        const currentMoment = dateTimeService.createUTC(currentStatementAt);
        const currentDay = currentMoment.date() as number;
        const currentMonth = currentMoment.month() as number;
        const currentYear = currentMoment.year() as number;

        // Calculate next month and year
        let nextMonth = currentMonth + 1;
        let nextYear = currentYear;
        if (nextMonth > 11) {
          nextMonth = 0;
          nextYear++;
        }

        // Create the next month's date with the same day (in UTC)
        const nextMonthMoment = dateTimeService
          .createUTC()
          .setYear(nextYear)
          .setMonth(nextMonth);

        // Check if the target day exists in the next month
        const daysInNextMonth = dateTimeService.daysInMonth(nextMonthMoment);

        let targetDay: number;
        let targetMonth = nextMonth;
        let targetYear = nextYear;

        if (currentDay > daysInNextMonth) {
          // Day doesn't exist in next month
          // Special case: If current day is 31 and next month is February, skip to March 1
          // This handles Jan 31 -> Mar 1 (not Feb 29)
          if (currentDay === 31 && nextMonth === 1) {
            targetMonth = 2; // March
            targetDay = 1;
            if (targetMonth > 11) {
              targetMonth = 0;
              targetYear++;
            }
          } else {
            // Otherwise, clamp to last day of next month
            targetDay = daysInNextMonth;
          }
        } else {
          targetDay = currentDay;
        }

        const resultMoment = dateTimeService
          .createUTC()
          .setYear(targetYear)
          .setMonth(targetMonth)
          .setDate(targetDay);

        return dateTimeService.toDate(resultMoment);
      }
      case 4: { // Year
        // Ensure we work in UTC to avoid timezone issues
        const yearlyMoment = dateTimeService.createUTC(currentStatementAt);
        const currentDay = yearlyMoment.date() as number;
        const currentMonth = yearlyMoment.month() as number;
        const currentYear = yearlyMoment.year() as number;

        // Add one year
        const nextYear = currentYear + 1;

        // Handle Feb 29 -> Mar 1 in non-leap years
        if (currentMonth === 1 && currentDay === 29) {
          // Check if next year is a leap year by checking days in February
          const nextYearFeb = dateTimeService
            .createUTC()
            .setYear(nextYear)
            .setMonth(1);
          const daysInFeb = dateTimeService.daysInMonth(nextYearFeb);

          if (daysInFeb < 29) {
            // Next year is not a leap year, move to Mar 1
            return dateTimeService.toDate(
              dateTimeService
                .createUTC()
                .setYear(nextYear)
                .setMonth(2)
                .setDate(1)
            );
          }
        }

        // For other dates, add one year normally
        const yearlyNextDay = yearlyMoment.add(1, "year");
        return yearlyNextDay;
      }
      case 5: { // Once (one-time)
        // Use moment's add method directly to avoid any wrapper issues
        const onceMoment = dateTimeService.create(currentStatementAt);
        const onceNextDay = onceMoment.add(1, "year"); // Default to yearly for one-time

        return onceNextDay;
      }
      default: {
        // For monthly, manually construct the next month's date
        const currentMomentDefault = dateTimeService.create(currentStatementAt);
        const currentDayDefault = currentMomentDefault.date() as number;
        const currentMonthDefault = currentMomentDefault.month() as number;
        const currentYearDefault = currentMomentDefault.year() as number;

        // Calculate next month and year
        let nextMonthDefault = currentMonthDefault + 1;
        let nextYearDefault = currentYearDefault;
        if (nextMonthDefault > 11) {
          nextMonthDefault = 0;
          nextYearDefault++;
        }

        // Create the next month's date with the same day
        const nextMonthMomentDefault = dateTimeService
          .create()
          .setYear(nextYearDefault)
          .setMonth(nextMonthDefault)
          .setDate(currentDayDefault);
        return dateTimeService.toDate(nextMonthMomentDefault);
      }
    }
  }

  /** Cached at timeline start to avoid full account scans every day. */
  private _cachedInterestAccounts: CacheAccountRegister[] | null = null;
  private _cachedExtraPaymentAccounts: CacheAccountRegister[] | null = null;

  /** Call once at timeline start so getInterestBearingAccounts/getAccountsWithExtraPayments are O(1). */
  initTimelineAccountCaches(): void {
    this._cachedInterestAccounts = this.cache.accountRegister.find(
      (account) =>
        account.balance !== 0 &&
        (account.targetAccountRegisterId !== null || account.typeId === 2)
    );
    this._cachedExtraPaymentAccounts = this.cache.accountRegister.find({
      allowExtraPayment: true,
    });
  }

  getAccountsByType(typeId: number): CacheAccountRegister[] {
    return this.cache.accountRegister.find({
      typeId: typeId,
    });
  }

  getInterestBearingAccounts(): CacheAccountRegister[] {
    if (this._cachedInterestAccounts !== null) {
      return this._cachedInterestAccounts;
    }
    return this.cache.accountRegister.find(
      (account) =>
        account.balance !== 0 &&
        (account.targetAccountRegisterId !== null || account.typeId === 2)
    );
  }

  getAccountsWithExtraPayments(): CacheAccountRegister[] {
    if (this._cachedExtraPaymentAccounts !== null) {
      return this._cachedExtraPaymentAccounts;
    }
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
