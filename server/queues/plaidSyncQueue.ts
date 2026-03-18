import type { Job } from "bullmq";
import { log } from "~/server/logger";
import PlaidSyncService from "~/server/services/PlaidSyncService";
import { dateTimeService } from "../services/forecast/DateTimeService";

export type PlaidSyncJob = {
  name: string;
  accountRegisterId?: number;
  resetSyncDates?: boolean;
  /** When set, only sync account registers for this Plaid Item (from webhook). */
  itemId?: string;
};

export default {
  queueName: "plaid-sync",
  processor: async (job: Job<PlaidSyncJob>) => {
    const start = dateTimeService.nowDate().getTime();
    log({
      level: "debug",
      message: `Start PlaidSyncJob job ${job.id} with data:`,
      data: job.data,
    });

    const plaidSyncService = new PlaidSyncService();

    await plaidSyncService.getAndSyncPlaidAccounts({
      accountRegisterId: job.data.accountRegisterId,
      resetSyncDates: job.data.resetSyncDates,
      itemId: job.data.itemId,
    });

    log({
      message: `Completed PlaidSyncJob ${job.id} in ${
        dateTimeService.nowDate().getTime() - start
      }ms`,
    });
  },
};
