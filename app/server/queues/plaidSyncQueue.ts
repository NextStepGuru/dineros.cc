import type { Job } from "bullmq";
import { log } from "~/server/logger";
import PlaidSyncService from "~/server/services/PlaidSyncService";
import { dateTimeService } from "../services/forecast/DateTimeService";
import { recordIntegrationJobLog } from "~/server/lib/recordIntegrationJobLog";

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

    try {
      await plaidSyncService.getAndSyncPlaidAccounts({
        accountRegisterId: job.data.accountRegisterId,
        resetSyncDates: job.data.resetSyncDates,
        itemId: job.data.itemId,
      });
    } catch (err) {
      log({
        message: "PLAID_SYNC_JOB_ERROR",
        level: "error",
        data: {
          error: err instanceof Error ? err.message : String(err),
          jobId: job.id,
          jobData: job.data,
        },
      });
      const msg = err instanceof Error ? err.message : String(err);
      await recordIntegrationJobLog({
        source: "plaid",
        queueName: "plaid-sync",
        jobId: job.id ? String(job.id) : null,
        message: msg.slice(0, 2000),
        itemId: job.data.itemId ?? null,
        metadata: {
          accountRegisterId: job.data.accountRegisterId ?? null,
          resetSyncDates: job.data.resetSyncDates ?? null,
        },
      });
      throw err;
    }

    log({
      message: `Completed PlaidSyncJob ${job.id} in ${
        dateTimeService.nowDate().getTime() - start
      }ms`,
    });
  },
};
