import { defineCronHandler } from "#nuxt/cron";
import { log } from "~/server/logger";
import { addPlaidSyncJob } from "~/server/clients/queuesClient";

const cronTime = () => "0 8 * * *";

export default defineCronHandler(cronTime, async () => {
  addPlaidSyncJob({
    name: "Synchronize Plaid accounts from Cron",
  });

  log({ message: "Plaid accounts synchronized successfully" });
});
