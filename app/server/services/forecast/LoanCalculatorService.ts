import { Loan } from "@dazlab-team/loan-calc";
import type {
  ILoanCalculatorService,
  InterestCalculationParams,
} from "./types";
import type { CacheAccountRegister } from "./ModernCacheService";
import { dateTimeService } from "./DateTimeService";
import {
  roundToCents,
  calculateCompoundInterest,
  calculatePercentage,
  multiplyMoney,
  maxMoney,
  absoluteMoney,
} from "../../../lib/bankers-rounding";
import { forecastLogger } from "./logger";

export class LoanCalculatorService implements ILoanCalculatorService {
  private isAmortizedLoanType(typeId: number): boolean {
    return typeId === 5 || typeId === 6 || typeId === 99;
  }

  private toFiniteNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private toPositiveNumber(value: unknown): number | null {
    const n = this.toFiniteNumber(value);
    if (n == null || n <= 0) return null;
    return n;
  }

  private resolveAprTier(
    aprValue: unknown,
    startAt: Date | null | undefined,
    checkDate: any,
  ): number | null {
    const apr = this.toFiniteNumber(aprValue);
    if (apr == null || apr <= 0) return null;
    if (!startAt || !dateTimeService.isValid(startAt)) return null;

    return dateTimeService.isSameOrAfter(checkDate, startAt) ? apr : null;
  }

  private resolveBaseApr(aprValue: unknown): number {
    const apr = this.toFiniteNumber(aprValue);
    if (apr == null || apr <= 0) return 0;
    return apr;
  }

  private resolveDateForAPR(
    accountRegister: CacheAccountRegister,
    checkDate?: any,
  ): any {
    if (checkDate) return checkDate;
    if (accountRegister.statementAt) return accountRegister.statementAt;
    return dateTimeService.nowDate();
  }

  private resolveLoanPrincipal(
    accountRegister: CacheAccountRegister,
    projectedBalance?: number,
  ): number | null {
    const loanOriginalAmount = this.toPositiveNumber(
      accountRegister.loanOriginalAmount,
    );
    if (loanOriginalAmount != null) return absoluteMoney(loanOriginalAmount);

    if (projectedBalance !== undefined) {
      const projected = this.toFiniteNumber(projectedBalance);
      if (projected != null) {
        const projectedAbs = this.toPositiveNumber(Math.abs(projected));
        if (projectedAbs != null) return projectedAbs;
      }
    }

    const fromBalance = this.toFiniteNumber(accountRegister.balance);
    if (fromBalance == null) return null;
    const fromBalanceAbs = this.toPositiveNumber(Math.abs(fromBalance));
    if (fromBalanceAbs == null) return null;
    return fromBalanceAbs;
  }

  private calculateFallbackPayment(
    accountRegister: CacheAccountRegister,
    interest: number,
  ): number {
    const minPayment = this.calculateMinPayment(accountRegister);
    const interestCharge = absoluteMoney(interest);

    // Use the greater of minimum payment or interest charge
    let payment = maxMoney(minPayment, interestCharge);

    // Don't pay more than the balance owed
    const maxPayable = absoluteMoney(accountRegister.balance);
    if (payment > maxPayable) {
      payment = maxPayable;
    }

    return roundToCents(payment);
  }

  private resolveBalanceForInterest(
    accountRegister: CacheAccountRegister,
    projectedBalance?: number,
  ): number {
    return projectedBalance === undefined
      ? Number(accountRegister.balance)
      : Number(projectedBalance);
  }

  private resolveAsOfDate(
    accountRegister: CacheAccountRegister,
    forecastDate?: Date,
  ): Date {
    if (forecastDate) {
      return dateTimeService.toDate(dateTimeService.createUTC(forecastDate));
    }
    if (accountRegister.statementAt) {
      return dateTimeService.toDate(
        dateTimeService.createUTC(accountRegister.statementAt),
      );
    }
    return dateTimeService.nowDate();
  }

  private resolveLoanStartDate(
    accountRegister: CacheAccountRegister,
  ): Date | null {
    if (!accountRegister.loanStartAt) return null;
    if (!dateTimeService.isValid(accountRegister.loanStartAt)) return null;
    return dateTimeService.toDate(
      dateTimeService.createUTC(accountRegister.loanStartAt),
    );
  }

  private resolveRemainingPayments(
    accountRegister: CacheAccountRegister,
    paymentsPerYear: number,
    loanTotalYears: number,
    asOfDate: Date,
  ): number {
    const totalPayments = Math.max(
      1,
      Math.round(loanTotalYears * paymentsPerYear),
    );
    const loanStart = this.resolveLoanStartDate(accountRegister);
    if (!loanStart) return totalPayments;

    const elapsedDays = Math.max(
      0,
      (asOfDate.getTime() - loanStart.getTime()) / (24 * 60 * 60 * 1000),
    );
    const elapsedPayments = Math.floor(
      (elapsedDays / 365.25) * paymentsPerYear,
    );
    return Math.max(1, totalPayments - Math.max(0, elapsedPayments));
  }

  private resolveCurrentDebt(
    accountRegister: CacheAccountRegister,
    projectedBalance?: number,
  ): number | null {
    const currentDebtRaw =
      projectedBalance === undefined
        ? this.toFiniteNumber(accountRegister.balance)
        : this.toFiniteNumber(projectedBalance);
    if (currentDebtRaw == null) return null;

    const currentDebt = Math.abs(currentDebtRaw);
    if (currentDebt <= 0) return 0;
    return currentDebt;
  }
  async calculateInterestCharge(
    params: InterestCalculationParams,
  ): Promise<number> {
    const { typeId, apr, balance, totalYears } = params;

    switch (typeId) {
      case 99:
      case 5: {
        // Loan types - use loan payment calculation
        const loan = new Loan();
        loan.amount = absoluteMoney(balance);
        loan.years = totalYears;
        loan.interestRate = multiplyMoney(apr, 100);

        try {
          return roundToCents(loan.totalInterest);
        } catch {
          // Fallback to percentage calculation
          return calculatePercentage(balance, apr);
        }
      }
      default: {
        // Standard interest calculation using bankers rounding
        return calculatePercentage(balance, apr);
      }
    }
  }

  calculateMinPayment(accountRegister: CacheAccountRegister): number {
    if (!accountRegister.minPayment) {
      return 0;
    }
    return absoluteMoney(accountRegister.minPayment);
  }

  async calculateInterestForAccount(
    accountRegister: CacheAccountRegister,
    projectedBalance?: number,
  ): Promise<number> {
    let interest = 0;

    // Determine which APR to use based on dates
    const apr = this.determineCurrentAPR(accountRegister);
    forecastLogger.debug("DEBUG: apr =", apr);

    if (apr > 0) {
      // Use projected balance if provided, otherwise use current balance
      // Ensure balance is converted to number
      const balanceToUse = this.resolveBalanceForInterest(
        accountRegister,
        projectedBalance,
      );

      forecastLogger.debug("DEBUG: balanceToUse =", balanceToUse);

      // Validate balance is a valid number
      if (Number.isNaN(balanceToUse)) {
        forecastLogger.debug("DEBUG: balanceToUse is NaN, returning 0");
        return 0;
      }

      // Calculate interest based on statement interval
      interest = this.calculateInterestByInterval(
        apr,
        balanceToUse,
        accountRegister.statementIntervalId,
      );

      forecastLogger.debug(
        "DEBUG: interest before sign adjustment =",
        interest,
      );

      // Positive accrual for savings / investment growth; negative for credit/loans
      if (accountRegister.accruesBalanceGrowth) {
        interest = absoluteMoney(interest);
      } else {
        interest = -absoluteMoney(interest);
      }

      forecastLogger.debug("DEBUG: interest after sign adjustment =", interest);
    } else {
      forecastLogger.debug("DEBUG: apr is 0 or negative, returning 0");
    }

    const result = roundToCents(interest);
    forecastLogger.debug("DEBUG: final result =", result);
    return result;
  }

  private calculateInterestByInterval(
    apr: number,
    balance: number,
    statementIntervalId: number,
  ): number {
    // Calculate daily interest rate (use regular division, not divideMoney for small rates)
    const dailyRate = apr / 365;

    // Determine number of days based on statement interval
    switch (statementIntervalId) {
      case 1: // Daily
        return calculateCompoundInterest(balance, dailyRate, 1);
      case 2: // Weekly
        return calculateCompoundInterest(balance, dailyRate, 7);
      case 3: // Monthly
        return calculateCompoundInterest(balance, dailyRate, 30);
      case 4: // Yearly
        return calculateCompoundInterest(balance, dailyRate, 365);
      default:
        return calculateCompoundInterest(balance, dailyRate, 30); // Default to monthly
    }
  }

  isCreditAccount(typeId: number): boolean {
    return (
      typeId === 3 ||
      typeId === 4 ||
      typeId === 5 ||
      typeId === 6 ||
      typeId === 99
    );
  }

  private determineCurrentAPR(
    accountRegister: CacheAccountRegister,
    checkDate?: any,
  ): number {
    const dateToCheck = this.resolveDateForAPR(accountRegister, checkDate);
    const apr3 = this.resolveAprTier(
      accountRegister.apr3,
      accountRegister.apr3StartAt,
      dateToCheck,
    );
    if (apr3 != null) return apr3;

    const apr2 = this.resolveAprTier(
      accountRegister.apr2,
      accountRegister.apr2StartAt,
      dateToCheck,
    );
    if (apr2 != null) return apr2;

    const apr1 = this.resolveAprTier(
      accountRegister.apr1,
      accountRegister.apr1StartAt,
      dateToCheck,
    );
    if (apr1 != null) return apr1;

    const apr1Fallback = this.resolveBaseApr(accountRegister.apr1);
    if (apr1Fallback <= 0) return 0;

    // Preserve legacy behavior only when APR1 has no usable start date.
    if (
      !accountRegister.apr1StartAt ||
      !dateTimeService.isValid(accountRegister.apr1StartAt)
    ) {
      return apr1Fallback;
    }

    // APR1 start exists but is not active yet.
    return 0;
  }

  calculatePaymentAmount(
    accountRegister: CacheAccountRegister,
    interest: number,
    projectedBalance?: number,
    forecastDate?: Date,
  ): number {
    const isAmortizedLoan = this.isAmortizedLoanType(accountRegister.typeId);
    if (isAmortizedLoan === false) {
      return this.calculateFallbackPayment(accountRegister, interest);
    }

    const paymentsPerYear = this.toPositiveNumber(
      accountRegister.loanPaymentsPerYear,
    );
    const loanTotalYears = this.toPositiveNumber(
      accountRegister.loanTotalYears,
    );
    const loanPrincipal = this.resolveLoanPrincipal(
      accountRegister,
      projectedBalance,
    );

    if (
      paymentsPerYear == null ||
      loanTotalYears == null ||
      loanPrincipal == null
    ) {
      return this.calculateFallbackPayment(accountRegister, interest);
    }

    const asOfDate = this.resolveAsOfDate(accountRegister, forecastDate);
    const loanStart = this.resolveLoanStartDate(accountRegister);
    if (loanStart) {
      if (asOfDate.getTime() < loanStart.getTime()) {
        return 0;
      }
    }

    const currentDebt = this.resolveCurrentDebt(
      accountRegister,
      projectedBalance,
    );
    if (currentDebt == null) {
      return this.calculateFallbackPayment(accountRegister, interest);
    }
    const remainingPayments = this.resolveRemainingPayments(
      accountRegister,
      paymentsPerYear,
      loanTotalYears,
      asOfDate,
    );

    const activeApr = this.determineCurrentAPR(accountRegister, asOfDate);
    if (!Number.isFinite(activeApr) || activeApr < 0) {
      return this.calculateFallbackPayment(accountRegister, interest);
    }

    const periodicRate = activeApr / paymentsPerYear;
    let scheduledPayment: number;
    if (Math.abs(periodicRate) < 1e-12) {
      scheduledPayment = loanPrincipal / remainingPayments;
    } else {
      scheduledPayment =
        (loanPrincipal * periodicRate) /
        (1 - Math.pow(1 + periodicRate, -remainingPayments));
    }
    if (!Number.isFinite(scheduledPayment) || scheduledPayment <= 0) {
      return this.calculateFallbackPayment(accountRegister, interest);
    }

    return roundToCents(Math.min(scheduledPayment, currentDebt));
  }

  shouldProcessInterest(
    accountRegister: CacheAccountRegister,
    forecastDate?: any,
  ): boolean {
    const checkDate =
      forecastDate ||
      dateTimeService.set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      });

    // Handle null/undefined statementAt
    if (!accountRegister.statementAt) {
      throw new Error("Cannot read properties of undefined");
    }

    const statementDate = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.createUTC(accountRegister.statementAt),
    );

    // Normalize both dates to UTC for comparison
    const normalizedCheckDate = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.clone(checkDate),
    );
    const normalizedStatementDate = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.clone(statementDate),
    );

    // Check if account has APR and balance (match transfer epsilon — float noise near zero)
    const hasAPR = this.determineCurrentAPR(accountRegister, checkDate) > 0;
    const hasBalance = absoluteMoney(accountRegister.balance) > 0.005;

    // Exact calendar match: statementAt is advanced one period per posted cycle, so the next
    // due date is always the next month/week/etc. (multi-advance in updateStatementDate was skipping months.)
    const isOnStatementDate =
      dateTimeService.format("YYYY-MM-DD", normalizedCheckDate) ===
      dateTimeService.format("YYYY-MM-DD", normalizedStatementDate);

    return hasAPR && hasBalance && isOnStatementDate;
  }
}
