import { defineCronHandler } from "#nuxt/cron";
import { addBackupJob } from "~/server/clients/queuesClient";
const cronTime = () => "0 7 * * *";

export default defineCronHandler(cronTime, async () => {
  addBackupJob({ name: "Daily backup" });
});
