import moment from "moment";
import { dateTimeService } from "../services/forecast/DateTimeService";
import { log } from "../logger";

export default defineNitroPlugin(() => {
  if (process.env.DEPLOY_ENV !== "local" || !process.env.TEST_DATE) {
    return;
  }
  const raw = process.env.TEST_DATE.trim();
  if (!raw) return;
  const parsed = moment.utc(raw);
  if (!parsed.isValid()) {
    log({
      message: `TEST_DATE invalid, ignored: ${raw}`,
      level: "warn",
    });
    return;
  }
  dateTimeService.setNowOverride(parsed);
  const formatted = dateTimeService.format(
    "YYYY-MM-DD HH:mm:ss",
    dateTimeService.now().utc()
  );
  log({
    message: `TEST_DATE set (UTC): ${formatted} UTC`,
    level: "info",
  });
});
