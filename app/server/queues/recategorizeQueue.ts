import type { Job } from "bullmq";
import { log } from "~/server/logger";
import TransactionCategorizationService from "~/server/services/TransactionCategorizationService";
import { dateTimeService } from "../services/forecast/DateTimeService";
import { recordIntegrationJobLog } from "~/server/lib/recordIntegrationJobLog";

export type RecategorizeJob = {
  accountId: string;
  accountRegisterId?: number;
  userId: number | null;
};

export default {
  queueName: "register-entry-recategorize",
  processor: async (job: Job<RecategorizeJob>) => {
    const start = dateTimeService.nowDate().getTime();
    log({
      level: "debug",
      message: `Start RecategorizeJob ${job.id} with data:`,
      data: job.data,
    });

    const service = new TransactionCategorizationService();
    try {
      const result = await service.recategorizeUnlockedPlaidEntries({
        accountId: job.data.accountId,
        accountRegisterId: job.data.accountRegisterId,
        userId: job.data.userId,
      });
      log({
        message: `Completed RecategorizeJob ${job.id} in ${
          dateTimeService.nowDate().getTime() - start
        }ms`,
        data: result,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log({
        message: "REGISTER_ENTRY_RECATEGORIZE_JOB_ERROR",
        level: "error",
        data: {
          error: msg,
          jobId: job.id,
          jobData: job.data,
        },
      });
      await recordIntegrationJobLog({
        source: "openai",
        queueName: "register-entry-recategorize",
        jobId: job.id ? String(job.id) : null,
        message: msg.slice(0, 2000),
        metadata: {
          accountId: job.data.accountId,
          accountRegisterId: job.data.accountRegisterId ?? null,
        },
      });
      throw err;
    }
  },
};
