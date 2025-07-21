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
    accounts.forEach((account) => {
      const result = this.loanCalculator.shouldProcessInterest(
        account,
        forecastDate
      );
    });
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
    const interest = await this.loanCalculator.calculateInterestForAccount(
      accountRegister
    );
    const payment = this.loanCalculator.calculatePaymentAmount(
      accountRegister,
      Math.abs(interest)
    );

    if (payment > 0) {
      // Create interest charge entry if there's interest
      if (interest < 0) {
        this.entryService.createEntry({
          accountRegisterId: accountRegister.id,
          description: `Interest Charge`,
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
            intervalId: 3,
            intervalCount: 1,
            id: 0,
            endAt: null,
            totalIntervals: null,
            elapsedIntervals: null,
            updatedAt: dateTimeService.nowDate(),
            adjustBeforeIfOnWeekend: false,
          },
        });

        // Adjust payment to include latest interest if needed
        const minPayment =
          this.loanCalculator.calculateMinPayment(accountRegister);
        if (Math.abs(interest) + payment < Math.abs(minPayment)) {
          // This shouldn't normally happen due to calculatePaymentAmount logic
        }
      }

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
            intervalId: 3,
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

    // Update statement date
    await this.updateStatementDate(accountRegister, forecastDate);
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
      const newStatementAt = moment(statementAt).add({ month: 1 }).toDate();

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

  getAccountsByType(typeId: number): CacheAccountRegister[] {
    return this.cache.accountRegister.find({
      typeId: typeId,
    });
  }

  getInterestBearingAccounts(): CacheAccountRegister[] {
    const allAccounts = this.cache.accountRegister.find({});

    const interestAccounts = this.cache.accountRegister.find(
      (account) =>
        account.targetAccountRegisterId !== null && account.balance !== 0
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
