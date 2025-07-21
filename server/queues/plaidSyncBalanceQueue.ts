import type { Job } from "bullmq";
import moment from "moment";
import { prisma } from "~/prisma/prismaClient";
import { log } from "~/server/logger";
import PlaidSyncService from "~/server/services/PlaidSyncService";
import { dateTimeService } from "../services/forecast/DateTimeService";

export type PlaidSyncBalanceJob = {
  accountRegisterId: number;
};

export default {
  queueName: "plaid-sync-balance",
  processor: async (job: Job<PlaidSyncBalanceJob>) => {
    const start = dateTimeService.nowDate().getTime();
    log({
      level: "debug",
      message: `Start PlaidSyncBalanceJob job ${job.id} with data:`,
      data: job.data,
    });

    const plaidSyncService = new PlaidSyncService();

    const lookupPlaidAccessToken = await prisma.accountRegister.findFirst({
      where: {
        isArchived: false,
        id: job.data.accountRegisterId,
      },
      select: {
        plaidAccessToken: true,
      },
    });

    if (!lookupPlaidAccessToken?.plaidAccessToken) {
      log({
        level: "error",
        message: `No Plaid access token found for PlaidSyncBalanceJob ${job.id}`,
        data: { accountRegisterId: job.data.accountRegisterId },
      });
      return;
    }

    const olderThanDate = dateTimeService
      .now()
      .utc()
      .subtract({ hours: 6 })
      .toDate();

    const accountRegisters = await prisma.accountRegister.findMany({
      where: {
        plaidAccessToken: lookupPlaidAccessToken.plaidAccessToken,
        OR: [
          { plaidBalanceLastSyncAt: null },
          {
            plaidBalanceLastSyncAt: {
              lt: olderThanDate,
            },
          },
        ],
      },
      select: {
        plaidId: true,
        plaidAccessToken: true,
      },
    });

    const plaidAccountIds: string[] = accountRegisters
      .map((a) => a.plaidId)
      .filter((id): id is string => id !== null);

    if (plaidAccountIds.length === 0) {
      log({
        level: "info",
        message: `No accounts found for PlaidSyncBalanceJob ${job.id}`,
        data: { plaidAccessToken: job.data.accountRegisterId },
      });
      return;
    }

    const accounts =
      await plaidSyncService.getAllAccountsByAccessTokenAndUpdateBalance({
        accessToken: lookupPlaidAccessToken.plaidAccessToken,
        plaidAccountIds,
      });

    log({
      message: `Completed PlaidSyncBalanceJob ${job.id} in ${
        dateTimeService.nowDate().getTime() - start
      }ms`,
      data: {
        plaidAccounts: accounts.map((a) => ({
          account_id: a.account_id,
          balance: a.balances.current,
        })),
      },
    });
  },
};
