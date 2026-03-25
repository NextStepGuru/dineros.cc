import { defineCronHandler } from "#nuxt/cron";
import { log } from "~/server/logger";
import { addPlaidSyncJob } from "~/server/clients/queuesClient";
import { dateTimeService } from "~/server/services/forecast/DateTimeService";

const cronTime = () => "0 8 * * *";

export default defineCronHandler(cronTime, async () => {
  const runDate = dateTimeService.nowDate().toISOString().split("T")[0];
  await addPlaidSyncJob(
    {
      name: "Synchronize Plaid accounts from Cron",
    },
    {
      delay: 0,
      jobId: `plaid-daily-${runDate}`,
    },
  );

  log({ message: "Plaid accounts synchronized successfully" });
});
