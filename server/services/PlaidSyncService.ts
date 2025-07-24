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
            latestBalance,
            plaidBalanceLastSyncAt: dateTimeService.nowDate(),
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
      start_date: startDate,
      end_date: endDate,
      options: {
        account_ids: plaidAccountIds,
      },
    });

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
    const transactions = await this.getTransactions({
      accessToken,
      plaidAccountIds,
      startDate,
      endDate,
    });

    const accountRegisters = await this.db.accountRegister.findMany({
      where: {
        plaidId: {
          in: plaidAccountIds,
        },
        plaidAccessToken: accessToken,
      },
      include: {
        type: true,
      },
    });

    const accountRegisterMap = new Map(
      accountRegisters.map((ar) => [ar.plaidId, ar])
    );

    const transactionData = transactions
      .map((transaction) => {
        const accountRegister = accountRegisterMap.get(transaction.account_id);
        if (!accountRegister) {
          return null;
        }

        return this.formatTransactionData(
          transaction,
          accountRegister,
          accountRegister.type
        );
      })
      .filter((data): data is NonNullable<typeof data> => data !== null);

    if (transactionData.length > 0) {
      await this.db.registerEntry.createMany({
        data: transactionData,
        skipDuplicates: true,
      });

      // Trigger recalculate jobs for affected accounts
      const uniqueAccountIds = [
        ...new Set(
          transactionData.map((data) => data.accountRegisterId)
        ),
      ];

      for (const accountRegisterId of uniqueAccountIds) {
        const accountRegister = await this.db.accountRegister.findUnique({
          where: { id: accountRegisterId },
          select: { accountId: true },
        });

        if (accountRegister) {
          addRecalculateJob({ accountId: accountRegister.accountId });
        }
      }
    }

    return dateTimeService.nowDate();
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
            plaidLastSyncAt: dateTimeService
              .createUTC(plaidLastSyncAt)
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
