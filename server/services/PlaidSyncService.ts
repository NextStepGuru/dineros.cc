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
import moment from "moment";
import {
  addPlaidBalanceSyncJob,
  addRecalculateJob,
} from "~/server/clients/queuesClient";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { dateTimeService } from "./forecast/DateTimeService";

const DAYS_REQUESTED = 3;

class PlaidSyncService {
  db: PrismaClient;
  client: PlaidApi;

  constructor(db: PrismaClient = PrismaDb as PrismaClient) {
    this.db = db;
    this.client = new PlaidApi(configuration);
  }

  /**
   * Formats transaction data based on account register type
   * @param transaction - Raw Plaid transaction
   * @param accountRegister - Account register
   * @param accountType - Account type information
   * @returns Formatted transaction data for database insertion
   */
  private formatTransactionData(
    transaction: Transaction,
    accountRegister: AccountRegister,
    accountType: AccountType
  ) {
    // Format amount based on account type
    let formattedAmount = transaction.amount;
    if (!accountType.isCredit) {
      // For debit accounts, make amount negative
      formattedAmount = transaction.amount * -1;
    }
    // For credit accounts, amount stays positive

    // TODO: Add future transaction name formatting logic here
    const formattedName = transaction.name; // Placeholder for future formatting

    return {
      id: cuid(),
      plaidId: transaction.transaction_id,
      plaidJson: JSON.parse(JSON.stringify(transaction)),
      accountRegisterId: accountRegister.id,
      amount: formattedAmount,
      balance: 0,
      createdAt: new Date(transaction.date),
      description: formattedName,
      isProjected: false,
      isPending: true,
      hasBalanceReCalc: true,
    };
  }

  async getAllAccountsByAccessTokenAndUpdateBalance({
    accessToken,
    plaidAccountIds,
  }: {
    accessToken: string;
    plaidAccountIds: string[];
  }): Promise<AccountBase[]> {
    const accounts = await this.client.accountsGet({
      access_token: accessToken,
      options: { account_ids: [...plaidAccountIds] },
    });

    const accountList = accounts.data.accounts;

    for (const account of accountList) {
      const accountRegister = await this.db.accountRegister.findFirst({
        where: { plaidId: account.account_id, plaidAccessToken: accessToken },
        select: {
          id: true,
          type: true,
        },
      });

      if (accountRegister) {
        const latestBalance = accountRegister.type.isCredit
          ? parseFloat(account.balances.current?.toString() || "0") * -1
          : parseFloat(account.balances.available?.toString() || "0");

        await this.db.accountRegister.updateMany({
          where: { plaidId: account.account_id },
          data: {
            balance: latestBalance,
            latestBalance: latestBalance,
            plaidBalanceLastSyncAt: dateTimeService.now().utc().toDate(),
          },
        });
      }
    }

    return accountList;
  }

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
      options: {
        account_ids: [...plaidAccountIds],
        days_requested: DAYS_REQUESTED,
      },
      start_date: startDate,
      end_date: endDate,
    });

    // Write raw transaction data to temp file for debugging
    const tempDir = join(process.cwd(), "temp");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const filename = `plaid-raw-transactions-${
      dateTimeService.nowDate().toISOString().split("T")[0]
    }.json`;
    const filepath = join(tempDir, filename);

    writeFileSync(
      filepath,
      JSON.stringify(
        {
          accessToken: accessToken.substring(0, 10) + "...", // Only log first 10 chars for security
          plaidAccountIds,
          startDate,
          endDate,
          transactionCount: transactions.data.transactions.length,
          transactions: transactions.data.transactions,
          syncDate: dateTimeService.nowDate().toISOString(),
        },
        null,
        2
      )
    );

    console.log(
      `Wrote ${transactions.data.transactions.length} raw transactions to ${filepath}`
    );

    return transactions.data.transactions;
  }

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
  }): Promise<Date> {
    const getAllTransactions = await this.getTransactions({
      accessToken,
      plaidAccountIds,
      startDate,
      endDate,
    });

    const getAllAccountRegisters: (AccountRegister & {
      type: {
        id: number;
        type: string;
        name: string;
        isCredit: boolean;
        updatedAt: Date;
      };
    })[] = [];
    // had to write it like this b/c prisma doesn't support encrypted where in clauses
    for (const plaidAccountId of plaidAccountIds) {
      const accountRegister = await this.db.accountRegister.findFirst({
        where: { plaidId: plaidAccountId },
        include: { type: true },
      });

      if (accountRegister) {
        getAllAccountRegisters.push(accountRegister);
      }
    }

    let newestTransaction: Date | undefined;

    for (const accountRegister of getAllAccountRegisters) {
      const transactions = getAllTransactions.filter(
        (t) => t.account_id === accountRegister.plaidId
      );

      transactions.forEach(async (transaction) => {
        const existingEntry = await this.db.registerEntry.findFirst({
          where: {
            plaidId: transaction.transaction_id,
            accountRegisterId: accountRegister.id,
          },
        });

        const formattedData = this.formatTransactionData(
          transaction,
          accountRegister,
          accountRegister.type
        );

        if (!existingEntry) {
          await this.db.registerEntry.create({
            data: formattedData,
          });
        } else {
          await this.db.registerEntry.update({
            data: {
              plaidId: formattedData.plaidId,
              plaidJson: formattedData.plaidJson,
              amount: formattedData.amount,
              description: formattedData.description,
            },
            where: {
              id: existingEntry.id,
            },
          });
        }
      });

      addRecalculateJob({ accountId: accountRegister.accountId });

      const latestTransaction = new Date(
        transactions.reduce((prev, curr) =>
          new Date(prev.date).getTime() > new Date(curr.date).getTime()
            ? prev
            : curr
        ).date
      );

      if (!newestTransaction) {
        newestTransaction = latestTransaction;
      } else if (latestTransaction.getTime() > newestTransaction.getTime()) {
        newestTransaction = latestTransaction;
      }
    }

    return newestTransaction || dateTimeService.nowDate();
  }

  async getAndSyncPlaidAccounts(
    {
      accountRegisterId,
      resetSyncDates = false,
    }: {
      accountRegisterId?: number;
      resetSyncDates?: boolean;
    } = { resetSyncDates: false }
  ): Promise<void> {
    const accountRegisters = await PrismaDb.accountRegister.findMany({
      where: {
        isArchived: false,
        plaidId: {
          not: null,
        },
        id: accountRegisterId,
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

    accountRegisters.forEach(async ({ id }) => {
      addPlaidBalanceSyncJob({ accountRegisterId: id });
    });

    for (const accessToken in plaidAccounts) {
      try {
        const startDate = plaidAccounts[accessToken]
          .map((a) => a.plaidLastSyncAt)
          .reduce((a, b) => new Date(Math.min(a.getTime(), b.getTime())));

        const plaidLastSyncAt = await this.syncAllTransactions({
          accessToken,
          plaidAccountIds: plaidAccounts[accessToken].map((a) => a.plaidId),
          startDate: startDate.toISOString().split("T")[0],
          endDate: dateTimeService
            .now()
            .add(DAYS_REQUESTED, "days")
            .toISOString()
            .split("T")[0],
        });

        await this.db.accountRegister.updateMany({
          where: {
            id: {
              in: plaidAccounts[accessToken].map((a) => a.accountRegisterId),
            },
          },
          data: {
            plaidLastSyncAt: moment(plaidLastSyncAt)
              .utc()
              .set({ hours: 0, minutes: 0, seconds: 0, millisecond: 0 })
              .toDate(),
          },
        });
        log({
          message: "Sync Plaid Transactions",
          data: { accessToken, plaidAccountIds: plaidAccounts[accessToken] },
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
