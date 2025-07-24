import { Loan } from "@dazlab-team/loan-calc";
import moment from "moment";
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
  divideMoney,
  multiplyMoney,
  maxMoney,
  absoluteMoney,
} from "../../../lib/bankers-rounding";

export class LoanCalculatorService implements ILoanCalculatorService {
  async calculateInterestCharge(
    params: InterestCalculationParams
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
        } catch (error) {
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
    projectedBalance?: number
  ): Promise<number> {
    let interest = 0;

    // Determine which APR to use based on dates
    const apr = this.determineCurrentAPR(accountRegister);

    if (apr > 0) {
      // Use projected balance if provided, otherwise use current balance
      // Ensure balance is converted to number
      const balanceToUse =
        projectedBalance !== undefined
          ? Number(projectedBalance)
          : Number(accountRegister.balance);

      // Validate balance is a valid number
      if (isNaN(balanceToUse)) {
        return 0;
      }

      // Calculate interest based on statement interval
      interest = this.calculateInterestByInterval(
        apr,
        balanceToUse,
        accountRegister.statementIntervalId,
        accountRegister.typeId
      );

      // Apply correct sign for savings vs credit accounts
      if (accountRegister.typeId === 2) {
        // Savings account - positive interest (earned)
        interest = absoluteMoney(interest);
      } else {
        // Credit account - negative interest (charged)
        interest = -absoluteMoney(interest);
      }
    }

    return roundToCents(interest);
  }

  private calculateInterestByInterval(
    apr: number,
    balance: number,
    statementIntervalId: number,
    typeId: number
  ): number {
    const daysInYear = 365;
    let daysInInterval = 30; // Default to monthly

    // Determine days in interval based on statementIntervalId
    switch (statementIntervalId) {
      case 1: // Day
        daysInInterval = 1;
        break;
      case 2: // Week
        daysInInterval = 7;
        break;
      case 3: // Month
        daysInInterval = 30;
        break;
      case 4: // Year
        daysInInterval = 365;
        break;
      case 5: // Once (one-time)
        daysInInterval = 0;
        break;
      default:
        daysInInterval = 30; // Default to monthly
    }

    if (daysInInterval === 0) {
      return 0; // No recurring interest for one-time intervals
    }

    // For savings accounts, use compound interest
    if (typeId === 2) {
      // Use regular division for rates (don't round to 2 decimal places)
      const dailyRate = apr / daysInYear;
      return calculateCompoundInterest(balance, dailyRate, daysInInterval);
    }

    // For loan types, use simple interest calculation
    if (typeId === 5) {
      // Use regular division for rates (don't round intermediate values)
      const intervalRate = apr / daysInYear;
      const totalRate = intervalRate * daysInInterval;

      // Validate calculations
      if (isNaN(intervalRate) || isNaN(totalRate) || isNaN(balance)) {
        return 0; // Return 0 instead of propagating NaN
      }

      return multiplyMoney(balance, totalRate);
    }

    // For other account types, use simple percentage calculation
    // Use regular division for rates (don't round intermediate values)
    const intervalRate = apr / daysInYear;
    const totalRate = intervalRate * daysInInterval;

    // Validate calculations
    if (isNaN(intervalRate) || isNaN(totalRate) || isNaN(balance)) {
      return 0; // Return 0 instead of propagating NaN
    }

    return multiplyMoney(balance, totalRate);
  }

  isCreditAccount(typeId: number): boolean {
    const creditTypeIds = [3, 4, 5, 6, 7, 12, 13, 17, 19];
    return creditTypeIds.includes(typeId);
  }

  private determineCurrentAPR(
    accountRegister: CacheAccountRegister,
    checkDate?: moment.Moment
  ): number {
    const dateToCheck = checkDate || accountRegister.statementAt;

    // Check APR3 first (highest priority)
    if (
      accountRegister.apr3 &&
      accountRegister.apr3StartAt &&
      dateToCheck.isAfter(moment(accountRegister.apr3StartAt))
    ) {
      const apr = Number(accountRegister.apr3);
      return isNaN(apr) ? 0 : apr;
    }

    // Check APR2 (medium priority)
    if (
      accountRegister.apr2 &&
      accountRegister.apr2StartAt &&
      dateToCheck.isAfter(moment(accountRegister.apr2StartAt))
    ) {
      const apr = Number(accountRegister.apr2);
      return isNaN(apr) ? 0 : apr;
    }

    // Default to APR1
    if (accountRegister.apr1) {
      const apr = Number(accountRegister.apr1);
      return isNaN(apr) ? 0 : apr;
    }

    return 0;
  }

  calculatePaymentAmount(
    accountRegister: CacheAccountRegister,
    interest: number
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

  shouldProcessInterest(
    accountRegister: CacheAccountRegister,
    forecastDate?: moment.Moment
  ): boolean {
    const checkDate =
      forecastDate ||
      dateTimeService.now().utc().set({
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      });
    const statementDate = moment(accountRegister.statementAt).utc().set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    });

    // Normalize both dates to UTC for comparison
    const normalizedCheckDate = checkDate.clone().utc().set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    });
    const normalizedStatementDate = statementDate.clone().utc().set({
      hour: 0,
      minute: 0,
      second: 0,
      milliseconds: 0,
    });

    // Check if account has APR and balance
    const hasAPR = this.determineCurrentAPR(accountRegister, checkDate) > 0;
    const hasBalance = accountRegister.balance !== 0;
    const isStatementDate = normalizedCheckDate.isSame(normalizedStatementDate, "day");

    // Process interest only on exact statement date to avoid double processing
    // No grace period needed since we process every day in sequence
    return hasAPR && hasBalance && isStatementDate;
  }
}
