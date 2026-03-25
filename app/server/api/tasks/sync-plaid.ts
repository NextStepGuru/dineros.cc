import { addPlaidSyncJob } from "~/server/clients/queuesClient";
import { log } from "~/server/logger";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

export default defineEventHandler(async () => {
  await addPlaidSyncJob(
    {
      name: "Force Plaid sync from admin task",
    },
    {
      delay: 0,
      jobId: `force-plaid-sync-${dateTimeService.nowDate().getTime()}`,
    },
  );

  log({
    message: "Plaid sync job enqueued from admin task",
    level: "info",
  });

  return { message: "Plaid sync job queued." };
});
