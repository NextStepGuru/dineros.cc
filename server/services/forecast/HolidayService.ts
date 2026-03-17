import { dateTimeService } from "./DateTimeService";

function createUtcDate(year: number, month: number, day: number): Date {
  return dateTimeService.toDate(
    dateTimeService.createUTC(
      `${String(year).padStart(4, "0")}-${String(month).padStart(
        2,
        "0",
      )}-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    ),
  );
}

function toIsoDate(year: number, month: number, day: number): string {
  return dateTimeService.format("YYYY-MM-DD", createUtcDate(year, month, day));
}

function getUtcDayOfWeek(year: number, month: number, day: number): number {
  return dateTimeService.day(createUtcDate(year, month, day));
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): number {
  let day = 1;
  let matches = 0;
  const maxDay = dateTimeService.daysInMonth(createUtcDate(year, month, 1));
  while (day <= maxDay) {
    if (getUtcDayOfWeek(year, month, day) === weekday) {
      matches += 1;
      if (matches === nth) return day;
    }
    day += 1;
  }
  return maxDay;
}

function lastWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
): number {
  let day = dateTimeService.daysInMonth(createUtcDate(year, month, 1));
  while (day > 0) {
    if (getUtcDayOfWeek(year, month, day) === weekday) {
      return day;
    }
    day -= 1;
  }
  return 1;
}

function addObservedHolidayDates(
  set: Set<string>,
  year: number,
  month: number,
  day: number,
): void {
  const dow = getUtcDayOfWeek(year, month, day);
  set.add(toIsoDate(year, month, day));
  if (dow === 6) {
    // Saturday observed Friday
    const observed = dateTimeService.subtract(
      1,
      "days",
      createUtcDate(year, month, day),
    );
    set.add(dateTimeService.format("YYYY-MM-DD", observed));
  } else if (dow === 0) {
    // Sunday observed Monday
    const observed = dateTimeService.add(
      1,
      "days",
      createUtcDate(year, month, day),
    );
    set.add(dateTimeService.format("YYYY-MM-DD", observed));
  }
}

function addObservedDateOnlyIfInTargetYear(
  set: Set<string>,
  holidayYear: number,
  month: number,
  day: number,
  targetYear: number,
): void {
  const dow = getUtcDayOfWeek(holidayYear, month, day);
  const holidayDate = createUtcDate(holidayYear, month, day);
  let observedIso: string | null = null;

  if (dow === 6) {
    // Saturday observed Friday
    observedIso = dateTimeService.format(
      "YYYY-MM-DD",
      dateTimeService.subtract(1, "days", holidayDate),
    );
  } else if (dow === 0) {
    // Sunday observed Monday
    observedIso = dateTimeService.format(
      "YYYY-MM-DD",
      dateTimeService.add(1, "days", holidayDate),
    );
  }

  if (!observedIso) return;
  const observedYear = Number(observedIso.slice(0, 4));
  if (observedYear !== targetYear) return;
  set.add(observedIso);
}

export class HolidayService {
  private cache = new Map<number, Set<string>>();

  isHoliday(date: Date): boolean {
    const d = dateTimeService.createUTC(date);
    const year = Number(dateTimeService.format("YYYY", d));
    const iso = dateTimeService.format("YYYY-MM-DD", d);
    const holidays = this.getHolidaysForYear(year);
    return holidays.has(iso);
  }

  private getHolidaysForYear(year: number): Set<string> {
    const cached = this.cache.get(year);
    if (cached) return cached;

    const dates = new Set<string>();

    // Fixed-date federal holidays with observed dates
    addObservedHolidayDates(dates, year, 1, 1); // New Year's Day
    // Capture observed New Year's Day when next year's Jan 1 falls on weekend
    // (e.g. 2028-01-01 observed on 2027-12-31).
    addObservedDateOnlyIfInTargetYear(dates, year + 1, 1, 1, year);
    addObservedHolidayDates(dates, year, 6, 19); // Juneteenth
    addObservedHolidayDates(dates, year, 7, 4); // Independence Day
    addObservedHolidayDates(dates, year, 11, 11); // Veterans Day
    addObservedHolidayDates(dates, year, 12, 25); // Christmas Day

    // Floating federal holidays
    dates.add(toIsoDate(year, 1, nthWeekdayOfMonth(year, 1, 1, 3))); // MLK Day
    dates.add(toIsoDate(year, 2, nthWeekdayOfMonth(year, 2, 1, 3))); // Presidents' Day
    dates.add(toIsoDate(year, 5, lastWeekdayOfMonth(year, 5, 1))); // Memorial Day
    dates.add(toIsoDate(year, 9, nthWeekdayOfMonth(year, 9, 1, 1))); // Labor Day
    dates.add(toIsoDate(year, 10, nthWeekdayOfMonth(year, 10, 1, 2))); // Columbus Day
    dates.add(toIsoDate(year, 11, nthWeekdayOfMonth(year, 11, 4, 4))); // Thanksgiving

    this.cache.set(year, dates);
    return dates;
  }
}

export const holidayService = new HolidayService();
