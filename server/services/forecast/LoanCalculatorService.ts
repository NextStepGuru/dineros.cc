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
    console.log("DEBUG: apr =", apr);

    if (apr > 0) {
      // Use projected balance if provided, otherwise use current balance
      // Ensure balance is converted to number
      const balanceToUse =
        projectedBalance !== undefined
          ? Number(projectedBalance)
          : Number(accountRegister.balance);

      console.log("DEBUG: balanceToUse =", balanceToUse);

      // Validate balance is a valid number
      if (isNaN(balanceToUse)) {
        console.log("DEBUG: balanceToUse is NaN, returning 0");
        return 0;
      }

      // Calculate interest based on statement interval
      interest = this.calculateInterestByInterval(
        apr,
        balanceToUse,
        accountRegister.statementIntervalId,
        accountRegister.typeId
      );

      console.log("DEBUG: interest before sign adjustment =", interest);

      // Apply correct sign for savings vs credit accounts
      if (accountRegister.typeId === 2) {
        // Savings account - positive interest (earned)
        interest = absoluteMoney(interest);
      } else {
        // Credit account - negative interest (charged)
        interest = -absoluteMoney(interest);
      }

      console.log("DEBUG: interest after sign adjustment =", interest);
    } else {
      console.log("DEBUG: apr is 0 or negative, returning 0");
    }

    const result = roundToCents(interest);
    console.log("DEBUG: final result =", result);
    return result;
  }

  private calculateInterestByInterval(
    apr: number,
    balance: number,
    statementIntervalId: number,
    typeId: number
  ): number {
    // Calculate daily interest rate (use regular division, not divideMoney for small rates)
    const dailyRate = apr / 365;

    // Determine number of days based on statement interval
    let days = 30; // Default to monthly
    switch (statementIntervalId) {
      case 1: // Daily
        days = 1;
        break;
      case 2: // Weekly
        days = 7;
        break;
      case 3: // Monthly
        days = 30;
        break;
      case 4: // Yearly
        days = 365;
        break;
      default:
        days = 30; // Default to monthly
    }

    // Calculate interest using compound interest formula
    const result = calculateCompoundInterest(balance, dailyRate, days);
    return result;
  }

  isCreditAccount(typeId: number): boolean {
    return typeId === 3 || typeId === 4 || typeId === 5 || typeId === 99;
  }

  private determineCurrentAPR(
    accountRegister: CacheAccountRegister,
    checkDate?: any
  ): number {
    const dateToCheck = checkDate || accountRegister.statementAt;

    // Check APR3 first (highest priority)
    if (
      accountRegister.apr3 &&
      accountRegister.apr3 !== null &&
      accountRegister.apr3StartAt &&
      dateTimeService.isSameOrAfter(dateToCheck, accountRegister.apr3StartAt)
    ) {
      const apr = Number(accountRegister.apr3);
      return isNaN(apr) ? 0 : apr;
    }

    // Check APR2 (medium priority)
    if (
      accountRegister.apr2 &&
      accountRegister.apr2 !== null &&
      accountRegister.apr2StartAt &&
      dateTimeService.isSameOrAfter(dateToCheck, accountRegister.apr2StartAt)
    ) {
      const apr = Number(accountRegister.apr2);
      return isNaN(apr) ? 0 : apr;
    }

    // Default to APR1
    if (accountRegister.apr1 && accountRegister.apr1 !== null) {
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
    forecastDate?: any
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
      dateTimeService.createUTC(accountRegister.statementAt)
    );

    // Normalize both dates to UTC for comparison
    const normalizedCheckDate = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.clone(checkDate)
    );
    const normalizedStatementDate = dateTimeService.set(
      {
        hour: 0,
        minute: 0,
        second: 0,
        milliseconds: 0,
      },
      dateTimeService.clone(statementDate)
    );

    // Check if account has APR and balance
    const hasAPR = this.determineCurrentAPR(accountRegister, checkDate) > 0;
    const hasBalance = accountRegister.balance !== 0;

    // Process interest on statement date or within a small window to handle edge cases
    // Allow processing on the statement date or within 1 day to handle timezone issues
    const isOnStatementDate =
      dateTimeService.isSameOrAfter(
        normalizedCheckDate,
        normalizedStatementDate
      ) &&
      dateTimeService.isSameOrBefore(
        normalizedCheckDate,
        dateTimeService.add(1, "day", normalizedStatementDate)
      );

    return hasAPR && hasBalance && isOnStatementDate;
  }
}
