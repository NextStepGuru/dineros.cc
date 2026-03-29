import {
  DateTime,
  type DurationInputArg2,
  type UnitOfTimeStartOf,
  type MomentSetObject,
} from "./DateTime";

export type DateInput = DateTime | Date | string;

export interface RunContext {
  /** Fixed "now" (ISO with offset or UTC). */
  fixedNow: DateInput;
  /** IANA timezone for formatting and for interpreting date-only inputs (e.g. America/New_York). */
  timezone: string;
}

function toDate(input: DateInput): Date {
  if (input instanceof DateTime) return input.toDate();
  if (input instanceof Date) return new Date(input);
  return new Date(input);
}

function getTemporal(): any {
  return (globalThis as any).Temporal;
}

function parseDateOnlyInTimezoneToUTC(
  dateOnly: string,
  timezone: string,
): DateTime {
  const TemporalRef = getTemporal();
  const [year, month, day] = dateOnly.split("-").map(Number);
  if (!TemporalRef) {
    return DateTime.parseUTC(`${dateOnly}T00:00:00Z`);
  }

  const zdt = TemporalRef.ZonedDateTime.from({
    timeZone: timezone,
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  return new DateTime(new Date(Number(zdt.epochMilliseconds)));
}

function formatZonedFields(
  fields: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
    dayOfWeek: number;
  },
  format: string,
): string {
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const pad = (v: number, len = 2) => String(v).padStart(len, "0");
  const replacements: Record<string, string> = {
    YYYY: String(fields.year),
    MM: pad(fields.month),
    DD: pad(fields.day),
    HH: pad(fields.hour),
    mm: pad(fields.minute),
    ss: pad(fields.second),
    SSS: pad(fields.millisecond, 3),
    dddd: dayNames.at(((fields.dayOfWeek % 7) + 7) % 7) ?? "Sunday",
    M: String(fields.month),
    D: String(fields.day),
    H: String(fields.hour),
    m: String(fields.minute),
    s: String(fields.second),
  };

  return format.replaceAll(
    /YYYY|dddd|SSS|MM|DD|HH|mm|ss|M|D|H|m|s/g,
    (token) => replacements[token] ?? token,
  );
}

/**
 * Centralized date/time service. Single source of "now" and all datetime operations.
 * Use run context for deterministic replay (fixed now + timezone). Canonical model: UTC instants; timezone only at boundaries.
 */
export class DateTimeService {
  private static _instance: DateTimeService | null = null;
  private _nowOverride: DateTime | null = null;
  private _timezoneOverride: string | null = null;
  private constructor() {}

  static getInstance(): DateTimeService {
    if (!DateTimeService._instance) {
      DateTimeService._instance = new DateTimeService();
    }
    return DateTimeService._instance;
  }

  /**
   * Get the current date/time
   * Returns the override if set, otherwise returns the actual current time
   */
  now(): DateTime {
    if (this._nowOverride) {
      return this._nowOverride.clone();
    }
    return new DateTime();
  }

  /**
   * Get the current date/time as a JavaScript Date object
   */
  nowDate(): Date {
    return this.now().toDate();
  }

  /**
   * Set a time override for testing
   * @param date - The date to use as "now" for all subsequent calls
   */
  setNowOverride(date: DateInput): void {
    this._nowOverride = new DateTime(date);
  }

  /**
   * Set run context (fixed now + IANA timezone) for deterministic replay.
   */
  setRunContext(ctx: RunContext): void {
    this._nowOverride = new DateTime(ctx.fixedNow);
    this._timezoneOverride = ctx.timezone;
  }

  /**
   * Run fn with a temporary run context; restores previous state after.
   */
  withRunContext<T>(ctx: RunContext, fn: () => T): T {
    const prevOverride = this._nowOverride?.clone() ?? null;
    const prevTz = this._timezoneOverride;
    try {
      this.setRunContext(ctx);
      return fn();
    } finally {
      this._nowOverride = prevOverride;
      this._timezoneOverride = prevTz;
    }
  }

  /**
   * Clear the time override, returning to using actual current time
   */
  clearNowOverride(): void {
    this._nowOverride = null;
    this._timezoneOverride = null;
  }

  /**
   * Check if a time override is currently set
   */
  hasOverride(): boolean {
    return this._nowOverride !== null;
  }

  /**
   * Get the current override value (for debugging)
   */
  getOverride(): DateTime | null {
    return this._nowOverride?.clone() || null;
  }

  /**
   * Current run timezone (IANA) when set via setRunContext; null otherwise.
   */
  getRunTimezone(): string | null {
    return this._timezoneOverride;
  }

  /**
   * Parse API/job input to a UTC DateTime. Rejects ambiguous datetime strings (no Z or offset).
   * For date-only (YYYY-MM-DD), pass timezone to interpret in that zone; otherwise UTC midnight.
   */
  parseInput(value: string, timezone?: string): DateTime {
    const trimmed = value.trim();
    if (DateTime.isDateOnly(trimmed)) {
      const tz = timezone ?? this._timezoneOverride ?? "UTC";
      return parseDateOnlyInTimezoneToUTC(trimmed, tz);
    }
    if (!DateTime.hasExplicitOffset(trimmed)) {
      throw new Error(
        `DateTimeService.parseInput: ambiguous datetime (missing Z or offset). Use ISO with timezone: ${trimmed}`,
      );
    }
    return DateTime.parseUTC(trimmed);
  }

  /**
   * Start of day in UTC (00:00:00.000). Canonical day boundary.
   */
  startOfDay(date?: DateInput): DateTime {
    const base = date === undefined ? this.now() : new DateTime(date);
    return base.utc().startOfDayUTC();
  }

  /**
   * End of day in UTC (23:59:59.999). Canonical day boundary.
   */
  endOfDay(date?: DateInput): DateTime {
    const base = date === undefined ? this.now() : new DateTime(date);
    return base.utc().endOfDayUTC();
  }

  /**
   * Format a UTC instant in a specific timezone (IANA). Use at output boundaries only.
   */
  formatInTimezone(
    date: DateInput,
    timezone: string,
    format: string,
  ): string {
    const base = toDate(date);
    const TemporalRef = getTemporal();

    if (TemporalRef) {
      const instant = TemporalRef.Instant.fromEpochMilliseconds(base.getTime());
      const zoned = instant.toZonedDateTimeISO(timezone);
      return formatZonedFields(
        {
          year: zoned.year,
          month: zoned.month,
          day: zoned.day,
          hour: zoned.hour,
          minute: zoned.minute,
          second: zoned.second,
          millisecond: zoned.millisecond,
          dayOfWeek: zoned.dayOfWeek % 7,
        },
        format,
      );
    }

    return new DateTime(base).format(format);
  }

  /**
   * Ensure a DateTime is in UTC (clone and convert). Alias for createUTC for clarity at boundaries.
   */
  toUTC(date: DateInput): DateTime {
    return this.createUTC(date);
  }

  /**
   * Create a DateTime from UTC epoch milliseconds. Use for converting numeric bounds to Date/DateTime without direct Date constructor.
   */
  fromEpoch(ms: number): DateTime {
    return DateTime.parseUTC(new Date(ms));
  }

  // Context-aware methods that always use the current "now" context

  /**
   * Create a DateTime object from various input types
   * If no input is provided, uses the current "now" context
   */
  create(date?: DateInput): DateTime {
    if (date === undefined) {
      return this.now();
    }
    return new DateTime(date);
  }

  /**
   * Create a DateTime object and convert to UTC
   * If no input is provided, uses the current "now" context
   */
  createUTC(date?: DateInput): DateTime {
    if (date === undefined) {
      return this.now().utc();
    }
    return new DateTime(date).utc();
  }

  /**
   * Add time to a date
   * If no date is provided, uses the current "now" context
   */
  add(
    amount: number,
    unit: DurationInputArg2,
    date?: DateInput,
  ): DateTime {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.add(amount, unit);
  }

  /**
   * Subtract time from a date
   * If no date is provided, uses the current "now" context
   */
  subtract(
    amount: number,
    unit: DurationInputArg2,
    date?: DateInput,
  ): DateTime {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.subtract(amount, unit);
  }

  /**
   * Check if one date is after another
   * If date2 is not provided, compares against current "now" context
   */
  isAfter(
    date1: DateInput,
    date2?: DateInput,
  ): boolean {
    const compareDate = date2 === undefined ? this.now() : new DateTime(date2);
    return new DateTime(date1).isAfter(compareDate);
  }

  /**
   * Check if one date is before another
   * If date2 is not provided, compares against current "now" context
   */
  isBefore(
    date1: DateInput,
    date2?: DateInput,
  ): boolean {
    const compareDate = date2 === undefined ? this.now() : new DateTime(date2);
    return new DateTime(date1).isBefore(compareDate);
  }

  /**
   * Check if one date is same or before another
   * If date2 is not provided, compares against current "now" context
   */
  isSameOrBefore(
    date1: DateInput,
    date2?: DateInput,
  ): boolean {
    const compareDate = date2 === undefined ? this.now() : new DateTime(date2);
    return new DateTime(date1).isSameOrBefore(compareDate);
  }

  /**
   * Check if one date is same or after another
   * If date2 is not provided, compares against current "now" context
   */
  isSameOrAfter(
    date1: DateInput,
    date2?: DateInput,
  ): boolean {
    const compareDate = date2 === undefined ? this.now() : new DateTime(date2);
    return new DateTime(date1).isSameOrAfter(compareDate);
  }

  /**
   * Get start of time unit
   * If no date is provided, uses the current "now" context
   */
  startOf(unit: UnitOfTimeStartOf, date?: DateInput): DateTime {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.startOf(unit);
  }

  /**
   * Get end of time unit
   * If no date is provided, uses the current "now" context
   */
  endOf(unit: UnitOfTimeStartOf, date?: DateInput): DateTime {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.endOf(unit);
  }

  /**
   * Format a date as string
   * If no date is provided, uses the current "now" context
   */
  format(format: string, date?: DateInput): string {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.format(format);
  }

  /**
   * Convert to JavaScript Date
   * If no date is provided, uses the current "now" context
   */
  toDate(date?: DateInput): Date {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.toDate();
  }

  /**
   * Clone a DateTime object
   * If no date is provided, uses the current "now" context
   */
  clone(date?: DateInput): DateTime {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.clone();
  }

  /**
   * Set specific time units on a date
   * If no date is provided, uses the current "now" context
   */
  set(units: MomentSetObject, date?: DateInput): DateTime {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.set(units);
  }

  /**
   * Get the difference between two dates in specified unit
   * If date2 is not provided, compares against current "now" context
   */
  diff(
    date1: DateInput,
    date2?: DateInput,
    unit: DurationInputArg2 = "milliseconds",
  ): number {
    const compareDate = date2 === undefined ? this.now() : new DateTime(date2);
    return new DateTime(date1).diff(compareDate, unit);
  }

  /**
   * Check if a date is valid
   */
  isValid(date: any): boolean {
    return new DateTime(date).isValid();
  }

  /**
   * Parse a date string with format
   */
  parse(dateString: string, format: string): DateTime {
    return DateTime.parse(dateString, format);
  }

  /**
   * UTC midnight for calendar parts (month 0 = January).
   */
  utcCalendarDate(year: number, monthIndex0: number, day: number): DateTime {
    const mm = String(monthIndex0 + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return this.parse(`${year}-${mm}-${dd}`, "YYYY-MM-DD");
  }

  /**
   * Get the number of days in a month
   * If no date is provided, uses the current "now" context
   */
  daysInMonth(date?: DateInput): number {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.daysInMonth();
  }

  /**
   * Get the day of the month (1-31)
   * If no date is provided, uses the current "now" context
   */
  date(date?: DateInput): number {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.date() as number;
  }

  /**
   * Set the day of the month
   * If no date is provided, uses the current "now" context
   */
  setDate(day: number, date?: DateInput): DateTime {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.setDate(day);
  }

  /**
   * Get the day of the week (0 = Sunday, 6 = Saturday)
   * If no date is provided, uses the current "now" context
   */
  day(date?: DateInput): number {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.day();
  }

  /**
   * Convert to ISO string
   * If no date is provided, uses the current "now" context
   */
  toISOString(date?: DateInput): string {
    const baseDate = date === undefined ? this.now() : new DateTime(date);
    return baseDate.toISOString();
  }

  // Legacy methods for backward compatibility
  // These maintain the original parameter order for existing code

  /**
   * @deprecated Use create() instead
   */
  createFromInput(date: DateInput): DateTime {
    return this.create(date);
  }

  /**
   * @deprecated Use createUTC() instead
   */
  createUTCFromInput(date: DateInput): DateTime {
    return this.createUTC(date);
  }

  /**
   * @deprecated Use add(amount, unit, date) instead
   */
  addToDate(
    date: DateInput,
    amount: number,
    unit: DurationInputArg2,
  ): DateTime {
    return this.add(amount, unit, date);
  }

  /**
   * @deprecated Use subtract(amount, unit, date) instead
   */
  subtractFromDate(
    date: DateInput,
    amount: number,
    unit: DurationInputArg2,
  ): DateTime {
    return this.subtract(amount, unit, date);
  }

  /**
   * @deprecated Use isAfter(date1, date2) instead
   */
  isAfterDates(
    date1: DateInput,
    date2: DateInput,
  ): boolean {
    return this.isAfter(date1, date2);
  }

  /**
   * @deprecated Use isBefore(date1, date2) instead
   */
  isBeforeDates(
    date1: DateInput,
    date2: DateInput,
  ): boolean {
    return this.isBefore(date1, date2);
  }

  /**
   * @deprecated Use isSameOrBefore(date1, date2) instead
   */
  isSameOrBeforeDates(
    date1: DateInput,
    date2: DateInput,
  ): boolean {
    return this.isSameOrBefore(date1, date2);
  }

  /**
   * @deprecated Use isSameOrAfter(date1, date2) instead
   */
  isSameOrAfterDates(
    date1: DateInput,
    date2: DateInput,
  ): boolean {
    return this.isSameOrAfter(date1, date2);
  }

  /**
   * @deprecated Use startOf(unit, date) instead
   */
  startOfDate(
    date: DateInput,
    unit: UnitOfTimeStartOf,
  ): DateTime {
    return this.startOf(unit, date);
  }

  /**
   * @deprecated Use endOf(unit, date) instead
   */
  endOfDate(date: DateInput, unit: UnitOfTimeStartOf): DateTime {
    return this.endOf(unit, date);
  }

  /**
   * @deprecated Use format(format, date) instead
   */
  formatDate(date: DateInput, format: string): string {
    return this.format(format, date);
  }

  /**
   * @deprecated Use toDate(date) instead
   */
  toDateFromInput(date: DateInput): Date {
    return this.toDate(date);
  }

  /**
   * @deprecated Use clone(date) instead
   */
  cloneDate(date: DateInput): DateTime {
    return this.clone(date);
  }

  /**
   * @deprecated Use set(units, date) instead
   */
  setDateUnits(
    date: DateInput,
    units: MomentSetObject,
  ): DateTime {
    return this.set(units, date);
  }

  /**
   * @deprecated Use diff(date1, date2, unit) instead
   */
  diffDates(
    date1: DateInput,
    date2: DateInput,
    unit: DurationInputArg2 = "milliseconds",
  ): number {
    return this.diff(date1, date2, unit);
  }

  /**
   * @deprecated Use daysInMonth(date) instead
   */
  daysInMonthDate(date: DateInput): number {
    return this.daysInMonth(date);
  }

  /**
   * @deprecated Use date(date) instead
   */
  dateFromInput(date: DateInput): number {
    return this.date(date);
  }

  /**
   * @deprecated Use setDate(day, date) instead
   */
  setDateOnDate(date: DateInput, day: number): DateTime {
    return this.setDate(day, date);
  }
}

// Export a singleton instance for easy access
export const dateTimeService = DateTimeService.getInstance();
