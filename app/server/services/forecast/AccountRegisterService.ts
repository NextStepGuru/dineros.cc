import type { PrismaClient } from "@prisma/client";
import type { IAccountRegisterService } from "./types";
import type {
  CacheAccountRegister,
  ModernCacheService,
} from "./ModernCacheService";
import prismaPkg from "@prisma/client";
import type { LoanCalculatorService } from "./LoanCalculatorService";
import type { RegisterEntryService } from "./RegisterEntryService";
import type { TransferService } from "./TransferService";
import { dateTimeService } from "./DateTimeService";
import { getProjectedBalanceAtDate } from "./getProjectedBalanceAtDate";
import { absoluteMoney } from "../../../lib/bankers-rounding";

const { Prisma } = prismaPkg;

export class AccountRegisterService implements IAccountRegisterService {
  private _pendingStatementAtUpdates: { id: number; statementAt: Date }[] = [];
  private readonly cache: ModernCacheService;
  private readonly loanCalculator: LoanCalculatorService;
  private readonly entryService: RegisterEntryService;
  private readonly transferService: TransferService;

  constructor(
    _db: PrismaClient,
    cache: ModernCacheService,
    loanCalculator: LoanCalculatorService,
    entryService: RegisterEntryService,
    transferService: TransferService,
  ) {
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

  alignStatementAtForForecastStart(
    startDate: any,
    accountRegisters: CacheAccountRegister[],
  ): void {
    const startNorm = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.clone(startDate),
    );
    const startEpoch = dateTimeService.toDate(startNorm).getTime();

    for (const ar of accountRegisters) {
      if (!ar.statementAt || ar.isArchived) continue;
      const interestEligible =
        absoluteMoney(ar.balance) > 0.005 &&
        (ar.targetAccountRegisterId !== null ||
          ar.accruesBalanceGrowth === true);
      if (!interestEligible) continue;

      let st = dateTimeService.toDate(
        dateTimeService.set(
          {
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
          },
          dateTimeService.createUTC(ar.statementAt),
        ),
      );

      let guard = 0;
      while (st.getTime() < startEpoch && guard < 500) {
        const next = this.calculateNextStatementDate(
          dateTimeService.create(st),
          ar.statementIntervalId,
        );
        st = dateTimeService.toDate(
          dateTimeService.set(
            {
              hour: 0,
              minute: 0,
              second: 0,
              milliseconds: 0,
            },
            dateTimeService.createUTC(next),
          ),
        );
        guard += 1;
      }
      ar.statementAt = st;
      this.cache.accountRegister.update(ar);
    }
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
    forecastDate?: any,
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
    forecastDate?: any,
  ): Promise<void> {
    const accrualDate = dateTimeService.toDate(
      dateTimeService.set(
        { hour: 0, minute: 0, second: 0, milliseconds: 0 },
        dateTimeService.createUTC(accountRegister.statementAt),
      ),
    );
    const projectedBalance = getProjectedBalanceAtDate(
      this.cache,
      accountRegister.id,
      accrualDate,
    );

    const interest = await this.loanCalculator.calculateInterestForAccount(
      accountRegister,
      projectedBalance,
    );

    if (interest === 0) {
      await this.updateStatementDate(accountRegister, forecastDate);
      return;
    }

    const isCreditAccount = this.loanCalculator.isCreditAccount(
      accountRegister.typeId,
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
      forecastDate: accrualDate,
      typeId: isCreditAccount ? 2 : 3, // Interest Charge (2) or Interest Earned (3)
      categoryId: accountRegister.interestCategoryId ?? null,
      reoccurrence: {
        accountId: "",
        accountRegisterId: accountRegister.id,
        description: accountRegister.name,
        lastAt: dateTimeService.nowDate(), // Use current date for reoccurrence persistence
        amount: new Prisma.Decimal(Math.abs(interest)),
        transferAccountRegisterId: accountRegister.targetAccountRegisterId,
        intervalId: intervalId,
        intervalCount: 1,
        id: 0,
        endAt: null,
        totalIntervals: null,
        elapsedIntervals: null,
        updatedAt: dateTimeService.nowDate(),
        adjustBeforeIfOnWeekend: false,
        categoryId: null,
        amountAdjustmentMode: "NONE",
        amountAdjustmentDirection: null,
        amountAdjustmentValue: null,
        amountAdjustmentIntervalId: null,
        amountAdjustmentIntervalCount: 1,
        amountAdjustmentAnchorAt: null,
      },
    });

    // Balance already updated in RegisterEntryService.createEntry — do not call updateBalance here
    // (double-counting inflated loan balance and could skew payment caps).

    // If there's a target account, create a transfer payment
    if (accountRegister.targetAccountRegisterId) {
      const paymentAmount = this.loanCalculator.calculatePaymentAmount(
        accountRegister,
        interest,
        projectedBalance,
        accrualDate,
      );

      if (paymentAmount > 0) {
        this.transferService.transferBetweenAccountsWithDate({
          targetAccountRegisterId: accountRegister.id,
          sourceAccountRegisterId: accountRegister.targetAccountRegisterId,
          amount: Number(paymentAmount),
          description: `Payment to ${accountRegister.name}`,
          forecastDate: accrualDate,
          categoryId: accountRegister.paymentCategoryId ?? null,
          reoccurrence: {
            accountId: "",
            accountRegisterId: accountRegister.id,
            description: `Payment to ${accountRegister.name}`,
            lastAt: dateTimeService.nowDate(),
            amount: new Prisma.Decimal(Number(paymentAmount)),
            transferAccountRegisterId: accountRegister.targetAccountRegisterId,
            intervalId: intervalId,
            intervalCount: 1,
            id: 0,
            endAt: null,
            totalIntervals: null,
            elapsedIntervals: null,
            updatedAt: dateTimeService.nowDate(),
            adjustBeforeIfOnWeekend: false,
            categoryId: null,
            amountAdjustmentMode: "NONE",
            amountAdjustmentDirection: null,
            amountAdjustmentValue: null,
            amountAdjustmentIntervalId: null,
            amountAdjustmentIntervalCount: 1,
            amountAdjustmentAnchorAt: null,
          },
        });
      }
    } else {
      // If there's no target account, create a direct payment entry
      const paymentAmount = this.loanCalculator.calculatePaymentAmount(
        accountRegister,
        interest,
        projectedBalance,
        accrualDate,
      );

      if (paymentAmount > 0) {
        this.entryService.createEntry({
          accountRegisterId: accountRegister.id,
          description: `Payment for ${accountRegister.name}`,
          amount: Number(paymentAmount),
          forecastDate: accrualDate,
          typeId: 4, // Loan Payment
          categoryId: accountRegister.paymentCategoryId ?? null,
          reoccurrence: {
            accountId: "",
            accountRegisterId: accountRegister.id,
            description: `Payment for ${accountRegister.name}`,
            lastAt: dateTimeService.nowDate(),
            amount: new Prisma.Decimal(Number(paymentAmount)),
            transferAccountRegisterId: null,
            intervalId: intervalId,
            intervalCount: 1,
            id: 0,
            endAt: null,
            totalIntervals: null,
            elapsedIntervals: null,
            updatedAt: dateTimeService.nowDate(),
            adjustBeforeIfOnWeekend: false,
            categoryId: null,
            amountAdjustmentMode: "NONE",
            amountAdjustmentDirection: null,
            amountAdjustmentValue: null,
            amountAdjustmentIntervalId: null,
            amountAdjustmentIntervalCount: 1,
            amountAdjustmentAnchorAt: null,
          },
        });
      }
    }

    // Update statement date to next cycle
    await this.updateStatementDate(accountRegister, forecastDate);
  }

  async updateStatementDates(
    accounts: CacheAccountRegister[],
    forecastDate?: any,
  ): Promise<void> {
    // Add a simple flag to track if method is called
    (globalThis as any).updateStatementDatesCalled = true;
    (globalThis as any).updateStatementDatesCallCount =
      ((globalThis as any).updateStatementDatesCallCount || 0) + 1;
    for (const account of accounts) {
      await this.updateStatementDate(account, forecastDate);
    }
  }

  private async updateStatementDate(
    accountRegister: CacheAccountRegister,
    forecastDate?: any,
  ): Promise<void> {
    // Normalize both dates to UTC and set to start of day for comparison
    let statementAt = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.createUTC(accountRegister.statementAt),
    );
    const comparisonDate = forecastDate
      ? dateTimeService.set(
          {
            hour: 0,
            minute: 0,
            second: 0,
            milliseconds: 0,
          },
          dateTimeService.createUTC(forecastDate),
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
    // One interval per call — multi-period catch-up is handled by processInterestCharges' while loop.
    if (dateTimeService.isSameOrAfter(comparisonDate, statementAt)) {
      const newStatementAt = this.calculateNextStatementDate(
        statementAt,
        accountRegister.statementIntervalId,
      );
      statementAt = dateTimeService.create(newStatementAt);
      accountRegister.statementAt = dateTimeService.toDate(statementAt);
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
    statementIntervalId: number,
  ): any {
    switch (statementIntervalId) {
      case 1: {
        return dateTimeService.create(currentStatementAt).add(1, "day");
      }
      case 2: {
        return dateTimeService.create(currentStatementAt).add(1, "week");
      }
      case 3: {
        return this.calculateMonthlyNextStatementDate(currentStatementAt);
      }
      case 4: {
        return this.calculateYearlyNextStatementDate(currentStatementAt);
      }
      case 5: {
        return dateTimeService.create(currentStatementAt).add(1, "year");
      }
      default: {
        return this.calculateDefaultMonthlyStatementDate(currentStatementAt);
      }
    }
  }

  private getNextMonthYear(
    month: number,
    year: number,
  ): {
    month: number;
    year: number;
  } {
    const nextMonth = month + 1;
    if (nextMonth > 11) {
      return { month: 0, year: year + 1 };
    }
    return { month: nextMonth, year };
  }

  private calculateMonthlyNextStatementDate(currentStatementAt: any): Date {
    const currentMoment = dateTimeService.createUTC(currentStatementAt);
    const currentDay = currentMoment.date() as number;
    const currentMonth = currentMoment.month() as number;
    const currentYear = currentMoment.year() as number;

    const next = this.getNextMonthYear(currentMonth, currentYear);
    const nextMonthMoment = dateTimeService
      .createUTC()
      .setYear(next.year)
      .setMonth(next.month);
    const daysInNextMonth = dateTimeService.daysInMonth(nextMonthMoment);

    let targetMonth = next.month;
    let targetYear = next.year;
    let targetDay = currentDay;

    if (currentDay > daysInNextMonth) {
      if (currentDay === 31 && next.month === 1) {
        const march = this.getNextMonthYear(next.month, next.year);
        targetMonth = march.month;
        targetYear = march.year;
        targetDay = 1;
      } else {
        targetDay = daysInNextMonth;
      }
    }

    return dateTimeService.toDate(
      dateTimeService
        .createUTC()
        .setYear(targetYear)
        .setMonth(targetMonth)
        .setDate(targetDay),
    );
  }

  private calculateYearlyNextStatementDate(currentStatementAt: any): any {
    const yearlyMoment = dateTimeService.createUTC(currentStatementAt);
    const currentDay = yearlyMoment.date() as number;
    const currentMonth = yearlyMoment.month() as number;
    const currentYear = yearlyMoment.year() as number;
    const nextYear = currentYear + 1;

    if (currentMonth === 1 && currentDay === 29) {
      const nextYearFeb = dateTimeService
        .createUTC()
        .setYear(nextYear)
        .setMonth(1);
      const daysInFeb = dateTimeService.daysInMonth(nextYearFeb);

      if (daysInFeb < 29) {
        return dateTimeService.toDate(
          dateTimeService.createUTC().setYear(nextYear).setMonth(2).setDate(1),
        );
      }
    }

    return yearlyMoment.add(1, "year");
  }

  private calculateDefaultMonthlyStatementDate(currentStatementAt: any): Date {
    const currentMoment = dateTimeService.create(currentStatementAt);
    const currentDay = currentMoment.date() as number;
    const currentMonth = currentMoment.month() as number;
    const currentYear = currentMoment.year() as number;
    const next = this.getNextMonthYear(currentMonth, currentYear);

    return dateTimeService.toDate(
      dateTimeService
        .create()
        .setYear(next.year)
        .setMonth(next.month)
        .setDate(currentDay),
    );
  }

  /** Cached at timeline start to avoid full account scans every day. */
  private _cachedInterestAccounts: CacheAccountRegister[] | null = null;
  private _cachedExtraPaymentAccounts: CacheAccountRegister[] | null = null;

  /** Call once at timeline start so getInterestBearingAccounts/getAccountsWithExtraPayments are O(1). */
  initTimelineAccountCaches(): void {
    this._cachedInterestAccounts = this.cache.accountRegister.find(
      (account) =>
        absoluteMoney(account.balance) > 0.005 &&
        (account.targetAccountRegisterId !== null ||
          account.accruesBalanceGrowth === true),
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
        absoluteMoney(account.balance) > 0.005 &&
        (account.targetAccountRegisterId !== null ||
          account.accruesBalanceGrowth === true),
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
    accounts: CacheAccountRegister[],
  ): CacheAccountRegister[] {
    return accounts.filter((account) => this.isAccountActive(account));
  }

  createBalanceEntries(accounts: CacheAccountRegister[]): void {
    for (const account of accounts) {
      this.entryService.createBalanceEntry(account);
    }
  }
}
