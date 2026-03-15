import type {
  AccountRegister,
  AccountType,
  PrismaClient,
} from "@prisma/client";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";
import type { AccountBase, Transaction } from "plaid";
import { PlaidApi } from "plaid";
import { configuration } from "../lib/getPlaidClient";
import { createId as cuid } from "@paralleldrive/cuid2";
import { log } from "~/server/logger";
import {
  addPlaidBalanceSyncJob,
  addRecalculateJob,
} from "~/server/clients/queuesClient";
import { dateTimeService } from "./forecast/DateTimeService";
import TransactionMatchingService from "./TransactionMatchingService";

const DAYS_REQUESTED = 3;

interface SyncResult {
  newTransactions: number;
  matchedTransactions: number;
  totalProcessed: number;
  errors: string[];
}

class PlaidSyncService {
  db: PrismaClient;
  client: PlaidApi;
  transactionMatcher: TransactionMatchingService;

  constructor(db: PrismaClient = PrismaDb as PrismaClient) {
    this.db = db;
    this.client = new PlaidApi(configuration);
    this.transactionMatcher = new TransactionMatchingService(db);
  }

  /**
   * Formats transaction data based on account register type
   */
  private formatTransactionData(
    transaction: Transaction,
    accountRegister: AccountRegister,
    accountType: AccountType
  ) {
    let formattedAmount = transaction.amount;
    if (!accountType.isCredit) {
      formattedAmount = transaction.amount * -1;
    }

    const formattedName = transaction.name;

    return {
      id: cuid(),
      plaidId: transaction.transaction_id,
      plaidJson: JSON.parse(JSON.stringify(transaction)),
      accountRegisterId: accountRegister.id,
      amount: formattedAmount,
      balance: 0,
      createdAt: dateTimeService.toDate(dateTimeService.parseInput(transaction.date)),
      description: formattedName,
      isProjected: false,
      isPending: true,
      hasBalanceReCalc: true,
    };
  }

  /**
   * Syncs transactions for a single account register
   */
  private async syncTransactionsForAccount(
    accountRegister: AccountRegister & { type: AccountType },
    transactions: Transaction[]
  ): Promise<{ newCount: number; matchedCount: number; errors: string[] }> {
    let newCount = 0;
    let matchedCount = 0;
    const errors: string[] = [];

    for (const transaction of transactions) {
      try {
        const matchResult = await this.transactionMatcher.matchTransaction(
          transaction,
          accountRegister,
          accountRegister.type
        );

        if (matchResult.matchType === "skip") {
          // Transaction already exists, skip it
          log({
            message: `Skipping existing Plaid transaction: ${transaction.name}`,
            data: {
              transactionId: transaction.transaction_id,
              accountRegisterId: accountRegister.id,
            },
            level: "debug",
          });
        } else if (
          matchResult.isMatched &&
          matchResult.existingEntry &&
          matchResult.matchType !== "none"
        ) {
          // Update existing transaction
          await this.transactionMatcher.updateExistingTransaction(
            matchResult.existingEntry,
            transaction,
            matchResult.matchType as "exact" | "fuzzy"
          );
          matchedCount++;

          log({
            message: `Matched existing transaction: ${transaction.name}`,
            data: {
              transactionId: transaction.transaction_id,
              matchType: matchResult.matchType,
              accountRegisterId: accountRegister.id,
            },
            level: "info",
          });
        } else {
          // Create new transaction
          const transactionData = this.formatTransactionData(
            transaction,
            accountRegister,
            accountRegister.type
          );

          await this.transactionMatcher.createNewTransaction(
            transaction,
            accountRegister,
            accountRegister.type,
            transactionData
          );
          newCount++;
        }
      } catch (error) {
        const errorMsg = `Failed to process transaction ${transaction.transaction_id}: ${error}`;
        errors.push(errorMsg);
        log({
          message: errorMsg,
          data: { error },
          level: "error",
        });
      }
    }

    return { newCount, matchedCount, errors };
  }

  /**
   * Gets account balances and updates them
   */
  async getAllAccountsByAccessTokenAndUpdateBalance({
    accessToken,
    plaidAccountIds,
  }: {
    accessToken: string;
    plaidAccountIds: string[];
  }): Promise<AccountBase[]> {
    const [accountsResponse, accountRegisters] = await Promise.all([
      this.client.accountsGet({
        access_token: accessToken,
        options: { account_ids: [...plaidAccountIds] },
      }),
      this.db.accountRegister.findMany({
        where: {
          plaidId: { in: plaidAccountIds },
          plaidAccessToken: accessToken,
        },
        select: {
          id: true,
          plaidId: true,
          type: { select: { isCredit: true } },
        },
      }),
    ]);

    const accountList = accountsResponse.data.accounts;
    const registerByPlaidId = new Map(
      accountRegisters.map((r) => [r.plaidId, r])
    );
    const now = dateTimeService.nowDate();

    await Promise.all(
      accountList.map((account) => {
        const accountRegister = registerByPlaidId.get(account.account_id);
        if (!accountRegister) return Promise.resolve();

        const latestBalance = accountRegister.type.isCredit
          ? parseFloat(account.balances.current?.toString() || "0") * -1
          : parseFloat(account.balances.available?.toString() || "0");

        return this.db.accountRegister.updateMany({
          where: { plaidId: account.account_id },
          data: {
            latestBalance,
            plaidBalanceLastSyncAt: now,
          },
        });
      })
    );

    return accountList;
  }

  /**
   * Gets transactions from Plaid API
   */
  async getTransactions({
    accessToken,
    plaidAccountIds,
    startDate,
    endDate,
  }: {
    accessToken: string;
    plaidAccountIds: string[];
    startDate: string;
    endDate: string;
  }): Promise<Transaction[]> {
    const transactions = await this.client.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        account_ids: plaidAccountIds,
      },
    });

    return transactions.data.transactions;
  }

  /**
   * Syncs all transactions for multiple accounts
   */
  async syncAllTransactions({
    accessToken,
    plaidAccountIds,
    startDate,
    endDate,
  }: {
    accessToken: string;
    plaidAccountIds: string[];
    startDate: string;
    endDate: string;
  }): Promise<SyncResult> {
    const transactions = await this.getTransactions({
      accessToken,
      plaidAccountIds,
      startDate,
      endDate,
    });

    log({
      message: "Transactions fetched",
      data: {
        transactions: transactions.length,
        plaidAccountIds,
      },
      level: "info",
    });

    const accountRegisters = await this.db.accountRegister.findMany({
      where: {
        plaidAccessToken: accessToken,
      },
      include: {
        type: true,
      },
    });

    const accountRegisterMap = new Map(
      accountRegisters.map((ar) => [ar.plaidId, ar])
    );

    // Group transactions by account
    const transactionsByAccount = new Map<string, Transaction[]>();
    for (const transaction of transactions) {
      if (!transactionsByAccount.has(transaction.account_id)) {
        transactionsByAccount.set(transaction.account_id, []);
      }
      transactionsByAccount.get(transaction.account_id)!.push(transaction);
    }

    let totalNew = 0;
    let totalMatched = 0;
    const allErrors: string[] = [];

    // Process each account separately to avoid the 'in' clause issue
    for (const [plaidAccountId, accountTransactions] of transactionsByAccount) {
      const accountRegister = accountRegisterMap.get(plaidAccountId);
      if (!accountRegister) {
        log({
          message: `No account register found for Plaid account ID: ${plaidAccountId}`,
          level: "warn",
        });
        continue;
      }

      const result = await this.syncTransactionsForAccount(
        accountRegister,
        accountTransactions
      );

      totalNew += result.newCount;
      totalMatched += result.matchedCount;
      allErrors.push(...result.errors);
    }

    // Trigger recalculate jobs for affected accounts
    if (totalNew > 0 || totalMatched > 0) {
      const uniqueAccountIds = [
        ...new Set(accountRegisters.map((ar) => ar.accountId)),
      ];

      for (const accountId of uniqueAccountIds) {
        addRecalculateJob({ accountId });
      }
    }

    return {
      newTransactions: totalNew,
      matchedTransactions: totalMatched,
      totalProcessed: totalNew + totalMatched,
      errors: allErrors,
    };
  }

  /**
   * Main sync method that orchestrates the entire sync process
   */
  async getAndSyncPlaidAccounts(
    {
      accountRegisterId,
      resetSyncDates = false,
    }: {
      accountRegisterId?: number;
      resetSyncDates?: boolean;
    } = { resetSyncDates: false }
  ): Promise<void> {
    // Get account registers one by one to avoid 'in' clause with encrypted fields
    const accountRegisters = await PrismaDb.accountRegister.findMany({
      where: {
        isArchived: false,
        plaidId: {
          not: null,
        },
        ...(accountRegisterId && { id: accountRegisterId }),
      },
      select: {
        id: true,
        plaidId: true,
        plaidAccessToken: true,
        plaidLastSyncAt: true,
      },
    });

    const plaidAccounts: Record<
      string,
      { plaidId: string; plaidLastSyncAt: Date; accountRegisterId: number }[]
    > = {};

    for (const accountRegister of accountRegisters) {
      const token = accountRegister.plaidAccessToken;
      if (accountRegister.plaidId && token) {
        if (!plaidAccounts[token]) {
          plaidAccounts[token] = [];
        }

        plaidAccounts[token].push({
          plaidId: accountRegister.plaidId,
          plaidLastSyncAt: resetSyncDates
            ? dateTimeService.now().subtract(DAYS_REQUESTED, "days").toDate()
            : accountRegister.plaidLastSyncAt ||
              dateTimeService.now().subtract(DAYS_REQUESTED, "days").toDate(),
          accountRegisterId: accountRegister.id,
        });
      }
    }

    // Add balance sync jobs
    for (const { id } of accountRegisters) {
      addPlaidBalanceSyncJob({ accountRegisterId: id });
    }

    // Process each access token separately
    for (const accessToken in plaidAccounts) {
      try {
        const startDate = (() => {
          const dates = plaidAccounts[accessToken].map((a) => a.plaidLastSyncAt);
          if (dates.length === 0) return dateTimeService.nowDate();
          const minEpoch = Math.min(
            ...dates.map((d) => dateTimeService.createUTC(d).valueOf()),
          );
          return dateTimeService.fromEpoch(minEpoch).toDate();
        })();

        const syncResult = await this.syncAllTransactions({
          accessToken,
          plaidAccountIds: plaidAccounts[accessToken].map((a) => a.plaidId),
          startDate: startDate.toISOString().split("T")[0],
          endDate: dateTimeService
            .now()
            .add(DAYS_REQUESTED, "days")
            .toISOString()
            .split("T")[0],
        });

        // Update sync dates for all accounts with this token
        for (const accountInfo of plaidAccounts[accessToken]) {
          await this.db.accountRegister.update({
            where: { id: accountInfo.accountRegisterId },
            data: {
              plaidLastSyncAt: dateTimeService
                .createUTC(dateTimeService.nowDate())
                .set({ hours: 0, minutes: 0, seconds: 0, millisecond: 0 })
                .toDate(),
            },
          });
        }

        log({
          message: "Sync Plaid Transactions",
          data: {
            accessToken,
            plaidAccountIds: plaidAccounts[accessToken],
            syncResult,
          },
          level: "info",
        });
      } catch (error) {
        log({
          message: "error fetching account transactions",
          data: { error },
          level: "error",
        });
      }
    }
  }
}

export default PlaidSyncService;
