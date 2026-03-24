import { defineCronHandler } from "#nuxt/cron";
import { log } from "~/server/logger";
import { evaluateBillRemindersForAllBudgets } from "~/server/services/billCenterService";

export default defineCronHandler("hourly", async () => {
  const summary = await evaluateBillRemindersForAllBudgets();
  log({
    message: "Bill reminder evaluation completed",
    level: summary.failures.length > 0 ? "warn" : "info",
    data: summary,
  });
});
