import { dateTimeService } from "../services/forecast/DateTimeService";
import { log } from "../logger";

export default defineNitroPlugin(() => {
  if (process.env.DEPLOY_ENV !== "local" || !process.env.TEST_DATE) {
    return;
  }
  const raw = process.env.TEST_DATE.trim();
  if (!raw) return;
  const parsed = dateTimeService.createUTC(raw);
  if (!parsed.isValid()) {
    log({
      message: `TEST_DATE invalid, ignored: ${raw}`,
      level: "warn",
    });
    return;
  }
  const timezone = process.env.TEST_TIMEZONE?.trim() || "UTC";
  dateTimeService.setRunContext({
    fixedNow: parsed,
    timezone,
  });
  const formatted = dateTimeService.format(
    "YYYY-MM-DD HH:mm:ss",
    dateTimeService.now().utc(),
  );
  log({
    message: `TEST_DATE set (UTC): ${formatted}, timezone: ${timezone}`,
    level: "info",
  });
});
