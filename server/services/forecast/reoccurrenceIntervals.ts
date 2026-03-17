import { dateTimeService } from "./DateTimeService";

type IntervalUnit = "days" | "weeks" | "months" | "years";

export type ReoccurrenceIntervalInput = {
  intervalId: number;
  intervalCount?: number | null;
  intervalName?: string | null;
  lastAt: Date;
};

function normalizeIntervalName(intervalName?: string | null): string {
  return intervalName?.trim().toLowerCase() ?? "";
}

export function isTwiceMonthlyInterval(
  intervalId: number,
  intervalName?: string | null,
): boolean {
  const name = normalizeIntervalName(intervalName);
  return (
    intervalId === 6 ||
    name === "twice_monthly" ||
    name === "twice monthly" ||
    name === "semi-monthly" ||
    name === "semimonthly" ||
    name === "15th & last day" ||
    name === "15th and last day"
  );
}

function getIntervalUnitByName(intervalName?: string | null): IntervalUnit | null {
  const name = normalizeIntervalName(intervalName);
  if (name === "once" || name === "one-time" || name === "one time") return null;
  if (name === "day" || name === "days") return "days";
  if (name === "week" || name === "weeks") return "weeks";
  if (name === "month" || name === "months") return "months";
  if (name === "year" || name === "years") return "years";
  return null;
}

function getIntervalUnitById(intervalId: number): IntervalUnit | null {
  switch (intervalId) {
    case 1:
      return "days";
    case 2:
      return "weeks";
    case 3:
      return "months";
    case 4:
      return "years";
    case 5:
      return null;
    default:
      return null;
  }
}

function advanceTwiceMonthlyStep(lastAt: Date): Date {
  const last = dateTimeService.createUTC(lastAt);
  const dayOfMonth = dateTimeService.date(last);
  const endOfMonthDay = dateTimeService.daysInMonth(last);

  if (dayOfMonth < 15) {
    return dateTimeService.toDate(dateTimeService.setDate(15, last));
  }

  if (dayOfMonth < endOfMonthDay) {
    return dateTimeService.toDate(dateTimeService.setDate(endOfMonthDay, last));
  }

  const nextMonthStart = dateTimeService.startOf(
    "month",
    dateTimeService.add(1, "months", last),
  );
  return dateTimeService.toDate(dateTimeService.setDate(15, nextMonthStart));
}

export function calculateNextOccurrenceDate(
  input: ReoccurrenceIntervalInput,
): Date | null {
  const { intervalId, intervalName, lastAt } = input;
  const intervalCount = Number(input.intervalCount ?? 1);

  if (!lastAt) return null;
  if (intervalCount <= 0) return null;

  if (isTwiceMonthlyInterval(intervalId, intervalName)) {
    let next = dateTimeService.toDate(dateTimeService.createUTC(lastAt));
    for (let step = 0; step < intervalCount; step += 1) {
      next = advanceTwiceMonthlyStep(next);
    }
    return next;
  }

  const unitFromName = getIntervalUnitByName(intervalName);
  if (intervalName && unitFromName) {
    return dateTimeService.toDate(
      dateTimeService.add(intervalCount, unitFromName, lastAt),
    );
  }

  if (intervalName && unitFromName === null) {
    return null;
  }

  const unitFromId = getIntervalUnitById(intervalId);
  if (!unitFromId) return null;
  return dateTimeService.toDate(
    dateTimeService.add(intervalCount, unitFromId, lastAt),
  );
}
