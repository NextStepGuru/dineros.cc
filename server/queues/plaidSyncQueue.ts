import type { Job } from "bullmq";
import { log } from "~/server/logger";
import PlaidSyncService from "~/server/services/PlaidSyncService";

export type PlaidSyncJob = {
  name: string;
  accountRegisterId?: number;
  resetSyncDates?: boolean;
};

export default {
  queueName: "plaid-sync",
  processor: async (job: Job<PlaidSyncJob>) => {
    const start = new Date().getTime();
    log({
      level: "debug",
      message: `Start PlaidSyncJob job ${job.id} with data:`,
      data: job.data,
    });

    const plaidSyncService = new PlaidSyncService();

    await plaidSyncService.getAndSyncPlaidAccounts({
      accountRegisterId: job.data.accountRegisterId,
      resetSyncDates: job.data.resetSyncDates,
    });

    log({
      message: `Completed PlaidSyncJob ${job.id} in ${
        new Date().getTime() - start
      }ms`,
    });
  },
};
