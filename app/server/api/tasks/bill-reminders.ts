import { defineEventHandler } from "h3";
import { log } from "~/server/logger";
import { evaluateBillRemindersForAllBudgets } from "~/server/services/billCenterService";

export default defineEventHandler(async () => {
  const summary = await evaluateBillRemindersForAllBudgets();
  log({
    message: "Manual bill reminder evaluation completed",
    level: summary.failures.length > 0 ? "warn" : "info",
    data: summary,
  });
  return summary;
});
