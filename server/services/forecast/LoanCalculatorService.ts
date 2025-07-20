import { Loan } from "@dazlab-team/loan-calc";
import moment from "moment";
import type { ILoanCalculatorService, InterestCalculationParams } from "./types";
import type { CacheAccountRegister } from "./ModernCacheService";

export class LoanCalculatorService implements ILoanCalculatorService {

  async calculateInterestCharge(params: InterestCalculationParams): Promise<number> {
    const { typeId, apr, balance, totalYears } = params;

    switch (typeId) {
      case 99:
      case 5: { // Loan types
        const loan = new Loan();
        loan.amount = balance;
        loan.years = totalYears;
        loan.interestRate = apr * 100;
        return loan.totalInterest;
      }

      default: { // Standard credit/debit interest
        return (apr * balance) / 12;
      }
    }
  }

  calculateMinPayment(accountRegister: CacheAccountRegister): number {
    return accountRegister?.minPayment ? +accountRegister.minPayment * -1 : 0;
  }

  async calculateInterestForAccount(accountRegister: CacheAccountRegister): Promise<number> {
    let interest = 0;

    // Determine which APR to use based on dates
    const apr = this.determineCurrentAPR(accountRegister);

    if (apr > 0) {
      interest = await this.calculateInterestCharge({
        apr,
        balance: accountRegister.balance,
        typeId: accountRegister.typeId,
        totalYears: accountRegister?.loanTotalYears ? +accountRegister.loanTotalYears : 0,
      });
    }

    return interest * -1; // Make it negative for charges
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

  calculatePaymentAmount(accountRegister: CacheAccountRegister, interest: number): number {
    const minPayment = this.calculateMinPayment(accountRegister);
    let payment = minPayment > interest ? minPayment : interest;

    // Don't pay more than the balance
    if (payment > Math.abs(accountRegister.balance)) {
      payment = Math.abs(accountRegister.balance);
    }

    return payment;
  }

  shouldProcessInterest(accountRegister: CacheAccountRegister, forecastDate?: moment.Moment): boolean {
    const checkDate = forecastDate || moment().utc().set({
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

    // Only process on the EXACT statement date to ensure monthly intervals
    const result = (
      accountRegister.targetAccountRegisterId !== null &&
      accountRegister.balance !== 0 &&
      checkDate.isSame(statementDate, 'day') // Changed from isSameOrAfter to isSame
    );

    return result;
  }
}
