import moment, {
  type Moment,
  type DurationInputArg2,
  type unitOfTime,
  type MomentSetObject,
} from "moment-timezone";
import { DateTime } from "./DateTime";

export interface RunContext {
  /** Fixed "now" (ISO with offset or UTC). */
  fixedNow: DateTime | Moment | Date | string;
  /** IANA timezone for formatting and for interpreting date-only inputs (e.g. America/New_York). */
  timezone: string;
}

/**
 * Centralized date/time service. Single source of "now" and all datetime operations.
 * Use run context for deterministic replay (fixed now + timezone). Canonical model: UTC instants; timezone only at boundaries.
 */
export class DateTimeService {
  private static _instance: DateTimeService | null = null;
  private _nowOverride: DateTime | null = null;
  private _timezoneOverride: string | null = null;
  private _momentInstance: typeof moment;

  private constructor() {
    this._momentInstance = moment;
  }

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
  setNowOverride(date: DateTime | Moment | Date | string): void {
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
      const m = this._momentInstance.tz(trimmed + " 00:00:00", "YYYY-MM-DD HH:mm:ss", tz);
      return new DateTime(m.isValid() ? m.utc() : this._momentInstance.invalid());
    }
    if (!DateTime.hasExplicitOffset(trimmed)) {
      throw new Error(
        `DateTimeService.parseInput: ambiguous datetime (missing Z or offset). Use ISO with timezone: ${trimmed}`
      );
    }
    return new DateTime(this._momentInstance.utc(trimmed));
  }

  /**
   * Start of day in UTC (00:00:00.000). Canonical day boundary.
   */
  startOfDay(date?: DateTime | Moment | Date | string): DateTime {
    const base = date !== undefined ? new DateTime(date) : this.now();
    return base.utc().startOfDayUTC();
  }

  /**
   * End of day in UTC (23:59:59.999). Canonical day boundary.
   */
  endOfDay(date?: DateTime | Moment | Date | string): DateTime {
    const base = date !== undefined ? new DateTime(date) : this.now();
    return base.utc().endOfDayUTC();
  }

  /**
   * Format a UTC instant in a specific timezone (IANA). Use at output boundaries only.
   */
  formatInTimezone(
    date: DateTime | Moment | Date | string,
    timezone: string,
    format: string
  ): string {
    const m = date instanceof DateTime ? date.toMoment() : this._momentInstance(date);
    return m.utc().tz(timezone).format(format);
  }

  /**
   * Ensure a DateTime is in UTC (clone and convert). Alias for createUTC for clarity at boundaries.
   */
  toUTC(date: DateTime | Moment | Date | string): DateTime {
    return this.createUTC(date);
  }

  /**
   * Create a DateTime from UTC epoch milliseconds. Use for converting numeric bounds to Date/DateTime without direct Date constructor.
   */
  fromEpoch(ms: number): DateTime {
    return new DateTime(this._momentInstance.utc(ms));
  }

  // Context-aware methods that always use the current "now" context

  /**
   * Create a DateTime object from various input types
   * If no input is provided, uses the current "now" context
   */
  create(date?: DateTime | Moment | Date | string): DateTime {
    if (date === undefined) {
      return this.now();
    }
    return new DateTime(date);
  }

  /**
   * Create a DateTime object and convert to UTC
   * If no input is provided, uses the current "now" context
   */
  createUTC(date?: DateTime | Moment | Date | string): DateTime {
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
    date?: DateTime | Moment | Date | string
  ): DateTime {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.add(amount, unit);
  }

  /**
   * Subtract time from a date
   * If no date is provided, uses the current "now" context
   */
  subtract(
    amount: number,
    unit: DurationInputArg2,
    date?: DateTime | Moment | Date | string
  ): DateTime {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.subtract(amount, unit);
  }

  /**
   * Check if one date is after another
   * If date2 is not provided, compares against current "now" context
   */
  isAfter(
    date1: DateTime | Moment | Date | string,
    date2?: DateTime | Moment | Date | string
  ): boolean {
    const compareDate = date2 !== undefined ? new DateTime(date2) : this.now();
    return new DateTime(date1).isAfter(compareDate);
  }

  /**
   * Check if one date is before another
   * If date2 is not provided, compares against current "now" context
   */
  isBefore(
    date1: DateTime | Moment | Date | string,
    date2?: DateTime | Moment | Date | string
  ): boolean {
    const compareDate = date2 !== undefined ? new DateTime(date2) : this.now();
    return new DateTime(date1).isBefore(compareDate);
  }

  /**
   * Check if one date is same or before another
   * If date2 is not provided, compares against current "now" context
   */
  isSameOrBefore(
    date1: DateTime | Moment | Date | string,
    date2?: DateTime | Moment | Date | string
  ): boolean {
    const compareDate = date2 !== undefined ? new DateTime(date2) : this.now();
    return new DateTime(date1).isSameOrBefore(compareDate);
  }

  /**
   * Check if one date is same or after another
   * If date2 is not provided, compares against current "now" context
   */
  isSameOrAfter(
    date1: DateTime | Moment | Date | string,
    date2?: DateTime | Moment | Date | string
  ): boolean {
    const compareDate = date2 !== undefined ? new DateTime(date2) : this.now();
    return new DateTime(date1).isSameOrAfter(compareDate);
  }

  /**
   * Get start of time unit
   * If no date is provided, uses the current "now" context
   */
  startOf(
    unit: unitOfTime.StartOf,
    date?: DateTime | Moment | Date | string
  ): DateTime {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.startOf(unit);
  }

  /**
   * Get end of time unit
   * If no date is provided, uses the current "now" context
   */
  endOf(
    unit: unitOfTime.StartOf,
    date?: DateTime | Moment | Date | string
  ): DateTime {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.endOf(unit);
  }

  /**
   * Format a date as string
   * If no date is provided, uses the current "now" context
   */
  format(format: string, date?: DateTime | Moment | Date | string): string {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.format(format);
  }

  /**
   * Convert to JavaScript Date
   * If no date is provided, uses the current "now" context
   */
  toDate(date?: DateTime | Moment | Date | string): Date {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.toDate();
  }

  /**
   * Clone a DateTime object
   * If no date is provided, uses the current "now" context
   */
  clone(date?: DateTime | Moment | Date | string): DateTime {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.clone();
  }

  /**
   * Set specific time units on a date
   * If no date is provided, uses the current "now" context
   */
  set(
    units: MomentSetObject,
    date?: DateTime | Moment | Date | string
  ): DateTime {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.set(units);
  }

  /**
   * Get the difference between two dates in specified unit
   * If date2 is not provided, compares against current "now" context
   */
  diff(
    date1: DateTime | Moment | Date | string,
    date2?: DateTime | Moment | Date | string,
    unit: DurationInputArg2 = "milliseconds"
  ): number {
    const compareDate = date2 !== undefined ? new DateTime(date2) : this.now();
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
   * Get the number of days in a month
   * If no date is provided, uses the current "now" context
   */
  daysInMonth(date?: DateTime | Moment | Date | string): number {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.daysInMonth();
  }

  /**
   * Get the day of the month (1-31)
   * If no date is provided, uses the current "now" context
   */
  date(date?: DateTime | Moment | Date | string): number {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.date() as number;
  }

  /**
   * Set the day of the month
   * If no date is provided, uses the current "now" context
   */
  setDate(day: number, date?: DateTime | Moment | Date | string): DateTime {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.setDate(day);
  }

  /**
   * Get the day of the week (0 = Sunday, 6 = Saturday)
   * If no date is provided, uses the current "now" context
   */
  day(date?: DateTime | Moment | Date | string): number {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.day();
  }

  /**
   * Convert to ISO string
   * If no date is provided, uses the current "now" context
   */
  toISOString(date?: DateTime | Moment | Date | string): string {
    const baseDate = date !== undefined ? new DateTime(date) : this.now();
    return baseDate.toISOString();
  }

  // Legacy methods for backward compatibility
  // These maintain the original parameter order for existing code

  /**
   * @deprecated Use create() instead
   */
  createFromInput(date: DateTime | Moment | Date | string): DateTime {
    return this.create(date);
  }

  /**
   * @deprecated Use createUTC() instead
   */
  createUTCFromInput(date: DateTime | Moment | Date | string): DateTime {
    return this.createUTC(date);
  }

  /**
   * @deprecated Use add(amount, unit, date) instead
   */
  addToDate(
    date: DateTime | Moment | Date | string,
    amount: number,
    unit: DurationInputArg2
  ): DateTime {
    return this.add(amount, unit, date);
  }

  /**
   * @deprecated Use subtract(amount, unit, date) instead
   */
  subtractFromDate(
    date: DateTime | Moment | Date | string,
    amount: number,
    unit: DurationInputArg2
  ): DateTime {
    return this.subtract(amount, unit, date);
  }

  /**
   * @deprecated Use isAfter(date1, date2) instead
   */
  isAfterDates(
    date1: DateTime | Moment | Date | string,
    date2: DateTime | Moment | Date | string
  ): boolean {
    return this.isAfter(date1, date2);
  }

  /**
   * @deprecated Use isBefore(date1, date2) instead
   */
  isBeforeDates(
    date1: DateTime | Moment | Date | string,
    date2: DateTime | Moment | Date | string
  ): boolean {
    return this.isBefore(date1, date2);
  }

  /**
   * @deprecated Use isSameOrBefore(date1, date2) instead
   */
  isSameOrBeforeDates(
    date1: DateTime | Moment | Date | string,
    date2: DateTime | Moment | Date | string
  ): boolean {
    return this.isSameOrBefore(date1, date2);
  }

  /**
   * @deprecated Use isSameOrAfter(date1, date2) instead
   */
  isSameOrAfterDates(
    date1: DateTime | Moment | Date | string,
    date2: DateTime | Moment | Date | string
  ): boolean {
    return this.isSameOrAfter(date1, date2);
  }

  /**
   * @deprecated Use startOf(unit, date) instead
   */
  startOfDate(
    date: DateTime | Moment | Date | string,
    unit: unitOfTime.StartOf
  ): DateTime {
    return this.startOf(unit, date);
  }

  /**
   * @deprecated Use endOf(unit, date) instead
   */
  endOfDate(
    date: DateTime | Moment | Date | string,
    unit: unitOfTime.StartOf
  ): DateTime {
    return this.endOf(unit, date);
  }

  /**
   * @deprecated Use format(format, date) instead
   */
  formatDate(date: DateTime | Moment | Date | string, format: string): string {
    return this.format(format, date);
  }

  /**
   * @deprecated Use toDate(date) instead
   */
  toDateFromInput(date: DateTime | Moment | Date | string): Date {
    return this.toDate(date);
  }

  /**
   * @deprecated Use clone(date) instead
   */
  cloneDate(date: DateTime | Moment | Date | string): DateTime {
    return this.clone(date);
  }

  /**
   * @deprecated Use set(units, date) instead
   */
  setDateUnits(
    date: DateTime | Moment | Date | string,
    units: MomentSetObject
  ): DateTime {
    return this.set(units, date);
  }

  /**
   * @deprecated Use diff(date1, date2, unit) instead
   */
  diffDates(
    date1: DateTime | Moment | Date | string,
    date2: DateTime | Moment | Date | string,
    unit: DurationInputArg2 = "milliseconds"
  ): number {
    return this.diff(date1, date2, unit);
  }

  /**
   * @deprecated Use daysInMonth(date) instead
   */
  daysInMonthDate(date: DateTime | Moment | Date | string): number {
    return this.daysInMonth(date);
  }

  /**
   * @deprecated Use date(date) instead
   */
  dateFromInput(date: DateTime | Moment | Date | string): number {
    return this.date(date);
  }

  /**
   * @deprecated Use setDate(day, date) instead
   */
  setDateOnDate(
    date: DateTime | Moment | Date | string,
    day: number
  ): DateTime {
    return this.setDate(day, date);
  }
}

// Export a singleton instance for easy access
export const dateTimeService = DateTimeService.getInstance();
