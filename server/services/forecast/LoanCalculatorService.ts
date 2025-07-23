import { Loan } from "@dazlab-team/loan-calc";
import moment from "moment";
import type {
  ILoanCalculatorService,
  InterestCalculationParams,
} from "./types";
import type { CacheAccountRegister } from "./ModernCacheService";
import { dateTimeService } from "./DateTimeService";

export class LoanCalculatorService implements ILoanCalculatorService {
  async calculateInterestCharge(
    params: InterestCalculationParams
  ): Promise<number> {
    const { typeId, apr, balance, totalYears } = params;

    switch (typeId) {
      case 99:
      case 5: {
        // Loan types
        const loan = new Loan();
        loan.amount = balance;
        loan.years = totalYears;
        loan.interestRate = apr * 100;
        return loan.totalInterest;
      }

      default: {
        // Standard credit/debit interest
        return (apr * balance) / 12;
      }
    }
  }

  calculateMinPayment(accountRegister: CacheAccountRegister): number {
    // Return positive minimum payment amount for proper comparison
    return accountRegister?.minPayment
      ? Math.abs(+accountRegister.minPayment)
      : 0;
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
      const balanceToUse =
        projectedBalance !== undefined
          ? projectedBalance
          : accountRegister.balance;

      // Calculate interest based on statement interval
      interest = this.calculateInterestByInterval(
        apr,
        balanceToUse,
        accountRegister.statementIntervalId,
        accountRegister.typeId
      );
    }

    // For credit accounts, make interest negative (charge)
    // For savings accounts, make interest positive (earned)
    const isCreditAccount = this.isCreditAccount(accountRegister.typeId);
    return isCreditAccount ? -Math.abs(interest) : Math.abs(interest);
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

    // For loan types (typeId 5) and savings accounts (typeId 2), use compound interest
    if (typeId === 5 || typeId === 2) {
      return this.calculateCompoundInterest(apr, balance, daysInInterval);
    }

    // For other types, use simple interest calculation
    return (apr * balance * daysInInterval) / daysInYear;
  }

  private calculateCompoundInterest(
    apr: number,
    balance: number,
    daysInInterval: number
  ): number {
    // Calculate compound interest using daily compounding
    // Formula: P * (1 + r/n)^(nt) - P where n = 365, t = daysInInterval/365
    const principal = Math.abs(balance);
    const dailyRate = apr / 365;
    const compoundFactor = Math.pow(1 + dailyRate, daysInInterval);
    const interestAmount = principal * (compoundFactor - 1);

    return interestAmount;
  }

  private calculateLoanInterest(
    apr: number,
    balance: number,
    daysInInterval: number
  ): number {
    // For backward compatibility, this method now calls the new compound interest method
    return this.calculateCompoundInterest(apr, balance, daysInInterval);
  }

  isCreditAccount(typeId: number): boolean {
    // Credit account types based on the account types data
    const creditTypeIds = [3, 4, 5, 6, 7, 12, 13, 17]; // HELOC, Credit Card, Loan, Mortgage, Line of Credit, Student Loan, Auto Loan, Other Credit
    return creditTypeIds.includes(typeId);
  }

  private determineCurrentAPR(accountRegister: CacheAccountRegister): number {
    // Check APR3 first (highest priority)
    if (
      accountRegister.apr3 &&
      accountRegister.apr3StartAt &&
      accountRegister.statementAt.isAfter(accountRegister.apr3StartAt)
    ) {
      return +accountRegister.apr3;
    }

    // Check APR2 (medium priority)
    if (
      accountRegister.apr2 &&
      accountRegister.apr2StartAt &&
      accountRegister.statementAt.isAfter(accountRegister.apr2StartAt)
    ) {
      return +accountRegister.apr2;
    }

    // Default to APR1
    return accountRegister.apr1 ? +accountRegister.apr1 : 0;
  }

  calculatePaymentAmount(
    accountRegister: CacheAccountRegister,
    interest: number
  ): number {
    const minPayment = this.calculateMinPayment(accountRegister);
    const interestCharge = Math.abs(interest); // Get absolute value of interest for comparison

    // Use the greater of minimum payment or interest charge
    let payment = Math.max(minPayment, interestCharge);

    // Don't pay more than the balance owed
    if (payment > Math.abs(accountRegister.balance)) {
      payment = Math.abs(accountRegister.balance);
    }

    return payment;
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

    // Check if account has APR and balance
    const hasAPR = this.determineCurrentAPR(accountRegister) > 0;
    const hasBalance = accountRegister.balance !== 0;
    const isStatementDate = checkDate.isSame(statementDate, "day");

    // Allow processing within a grace period for missed statement dates
    // This handles cases where interest processing was missed on the exact date
    const gracePeriodDays = 7;
    const isWithinGracePeriod =
      checkDate.isAfter(statementDate) &&
      checkDate.diff(statementDate, "days") <= gracePeriodDays;

    // Process interest for accounts with APR and balance on statement date OR within grace period
    return hasAPR && hasBalance && (isStatementDate || isWithinGracePeriod);
  }
}
