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
  const normalizedName = normalizeIntervalName(intervalName);

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

  if (
    normalizedName === "once" ||
    normalizedName === "one-time" ||
    normalizedName === "one time"
  ) {
    return null;
  }

  const unitFromId = getIntervalUnitById(intervalId);
  if (!unitFromId) return null;
  return dateTimeService.toDate(
    dateTimeService.add(intervalCount, unitFromId, lastAt),
  );
}

/** First projected occurrence after `lastAt` (same semantics as forecast `calculateNextOccurrence`). */
export function computeFirstNextOccurrenceDate(params: {
  lastAt: Date | null;
  intervalId: number;
  intervalCount: number;
  intervalName?: string | null;
}): Date | null {
  if (!params.lastAt) return null;
  return calculateNextOccurrenceDate({
    lastAt: params.lastAt,
    intervalId: params.intervalId,
    intervalCount: params.intervalCount,
    intervalName: params.intervalName ?? undefined,
  });
}

export type AmountAdjustmentModeName = "NONE" | "PERCENT" | "FIXED";
export type AmountAdjustmentDirectionName = "INCREASE" | "DECREASE";

/** Number of completed adjustment periods strictly before `occurrenceDate` is after the anchor boundary. */
export function countCompletedAdjustmentSteps(params: {
  anchor: Date;
  occurrenceDate: Date;
  adjustmentIntervalId: number;
  adjustmentIntervalCount: number;
  adjustmentIntervalName?: string | null;
}): number {
  const {
    anchor,
    occurrenceDate,
    adjustmentIntervalId,
    adjustmentIntervalCount,
    adjustmentIntervalName,
  } = params;
  let cursor = dateTimeService.toDate(anchor);
  const end = dateTimeService.toDate(occurrenceDate);
  let m = 0;
  const maxIter = 100000;
  for (let i = 0; i < maxIter; i++) {
    const next = calculateNextOccurrenceDate({
      lastAt: cursor,
      intervalId: adjustmentIntervalId,
      intervalCount: adjustmentIntervalCount,
      intervalName: adjustmentIntervalName ?? undefined,
    });
    if (!next) break;
    if (dateTimeService.isAfter(next, end)) break;
    m++;
    cursor = next;
  }
  return m;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Backward/forward compatible percent normalization:
 * - Legacy storage: 5 means 5%
 * - New decimal storage: 0.05 means 5%
 */
function normalizePercentRate(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const abs = Math.abs(raw);
  if (abs > 1) return raw / 100;
  return raw;
}

export function applyReoccurrenceAmountAdjustment(
  baseAmount: number,
  mode: AmountAdjustmentModeName,
  direction: AmountAdjustmentDirectionName | null | undefined,
  value: number | null | undefined,
  completedSteps: number,
): number {
  if (mode === "NONE" || completedSteps <= 0) {
    return roundCents(baseAmount);
  }
  const v = value ?? 0;
  const dir = direction ?? "INCREASE";
  if (mode === "PERCENT") {
    const rate = normalizePercentRate(v);
    const factor = dir === "INCREASE" ? 1 + rate : 1 - rate;
    return roundCents(baseAmount * Math.pow(factor, completedSteps));
  }
  const sign = baseAmount >= 0 ? 1 : -1;
  const mag = Math.abs(baseAmount);
  const deltaPer = dir === "INCREASE" ? v : -v;
  const newMag = Math.max(0, mag + completedSteps * deltaPer);
  return roundCents(sign * newMag);
}
