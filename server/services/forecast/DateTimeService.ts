import moment from "moment";

/**
 * Centralized date/time service that can be overridden for testing
 * This allows us to control the "now" time in tests and ensure consistent behavior
 * All datetime operations respect the global override when set
 */
export class DateTimeService {
  private static _instance: DateTimeService | null = null;
  private _nowOverride: moment.Moment | null = null;
  private _momentInstance: typeof moment;

  private constructor() {
    this._momentInstance = moment;
    // Hardcoded override - set to July 20th at 11:32pm CDT
    // this._nowOverride = this._momentInstance("2025-08-21T00:10:00-05:00");
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
  now(): moment.Moment {
    if (this._nowOverride) {
      return this._nowOverride.clone();
    }
    return this._momentInstance();
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
  setNowOverride(date: moment.Moment | Date | string): void {
    this._nowOverride = this._momentInstance(date);
  }

  /**
   * Clear the time override, returning to using actual current time
   */
  clearNowOverride(): void {
    this._nowOverride = null;
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
  getOverride(): moment.Moment | null {
    return this._nowOverride?.clone() || null;
  }

  // Context-aware methods that always use the current "now" context

  /**
   * Create a moment object from various input types
   * If no input is provided, uses the current "now" context
   */
  create(date?: moment.Moment | Date | string): moment.Moment {
    if (date === undefined) {
      return this.now();
    }
    return this._momentInstance(date);
  }

  /**
   * Create a moment object and convert to UTC
   * If no input is provided, uses the current "now" context
   */
  createUTC(date?: moment.Moment | Date | string): moment.Moment {
    if (date === undefined) {
      return this.now().utc();
    }
    return this._momentInstance(date).utc();
  }

  /**
   * Add time to a date
   * If no date is provided, uses the current "now" context
   */
  add(
    amount: number,
    unit: moment.DurationInputArg2,
    date?: moment.Moment | Date | string
  ): moment.Moment {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.add(amount, unit);
  }

  /**
   * Subtract time from a date
   * If no date is provided, uses the current "now" context
   */
  subtract(
    amount: number,
    unit: moment.DurationInputArg2,
    date?: moment.Moment | Date | string
  ): moment.Moment {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.subtract(amount, unit);
  }

  /**
   * Check if one date is after another
   * If date2 is not provided, compares against current "now" context
   */
  isAfter(
    date1: moment.Moment | Date | string,
    date2?: moment.Moment | Date | string
  ): boolean {
    const compareDate =
      date2 !== undefined ? this._momentInstance(date2) : this.now();
    return this._momentInstance(date1).isAfter(compareDate);
  }

  /**
   * Check if one date is before another
   * If date2 is not provided, compares against current "now" context
   */
  isBefore(
    date1: moment.Moment | Date | string,
    date2?: moment.Moment | Date | string
  ): boolean {
    const compareDate =
      date2 !== undefined ? this._momentInstance(date2) : this.now();
    return this._momentInstance(date1).isBefore(compareDate);
  }

  /**
   * Check if one date is same or before another
   * If date2 is not provided, compares against current "now" context
   */
  isSameOrBefore(
    date1: moment.Moment | Date | string,
    date2?: moment.Moment | Date | string
  ): boolean {
    const compareDate =
      date2 !== undefined ? this._momentInstance(date2) : this.now();
    return this._momentInstance(date1).isSameOrBefore(compareDate);
  }

  /**
   * Check if one date is same or after another
   * If date2 is not provided, compares against current "now" context
   */
  isSameOrAfter(
    date1: moment.Moment | Date | string,
    date2?: moment.Moment | Date | string
  ): boolean {
    const compareDate =
      date2 !== undefined ? this._momentInstance(date2) : this.now();
    return this._momentInstance(date1).isSameOrAfter(compareDate);
  }

  /**
   * Get start of time unit
   * If no date is provided, uses the current "now" context
   */
  startOf(
    unit: moment.unitOfTime.StartOf,
    date?: moment.Moment | Date | string
  ): moment.Moment {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.startOf(unit);
  }

  /**
   * Get end of time unit
   * If no date is provided, uses the current "now" context
   */
  endOf(
    unit: moment.unitOfTime.StartOf,
    date?: moment.Moment | Date | string
  ): moment.Moment {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.endOf(unit);
  }

  /**
   * Format a date as string
   * If no date is provided, uses the current "now" context
   */
  format(format: string, date?: moment.Moment | Date | string): string {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.format(format);
  }

  /**
   * Convert to JavaScript Date
   * If no date is provided, uses the current "now" context
   */
  toDate(date?: moment.Moment | Date | string): Date {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.toDate();
  }

  /**
   * Clone a moment object
   * If no date is provided, uses the current "now" context
   */
  clone(date?: moment.Moment | Date | string): moment.Moment {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.clone();
  }

  /**
   * Set specific time units on a date
   * If no date is provided, uses the current "now" context
   */
  set(
    units: moment.MomentSetObject,
    date?: moment.Moment | Date | string
  ): moment.Moment {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.set(units);
  }

  /**
   * Get the difference between two dates in specified unit
   * If date2 is not provided, compares against current "now" context
   */
  diff(
    date1: moment.Moment | Date | string,
    date2?: moment.Moment | Date | string,
    unit: moment.DurationInputArg2 = "milliseconds"
  ): number {
    const compareDate =
      date2 !== undefined ? this._momentInstance(date2) : this.now();
    return this._momentInstance(date1).diff(compareDate, unit);
  }

  /**
   * Check if a date is valid
   */
  isValid(date: any): boolean {
    return this._momentInstance(date).isValid();
  }

  /**
   * Parse a date string with format
   */
  parse(dateString: string, format: string): moment.Moment {
    return this._momentInstance(dateString, format);
  }

  /**
   * Get the number of days in a month
   * If no date is provided, uses the current "now" context
   */
  daysInMonth(date?: moment.Moment | Date | string): number {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.daysInMonth();
  }

  /**
   * Get the day of the month (1-31)
   * If no date is provided, uses the current "now" context
   */
  date(date?: moment.Moment | Date | string): number {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.date();
  }

  /**
   * Set the day of the month
   * If no date is provided, uses the current "now" context
   */
  setDate(day: number, date?: moment.Moment | Date | string): moment.Moment {
    const baseDate =
      date !== undefined ? this._momentInstance(date) : this.now();
    return baseDate.date(day);
  }

  // Legacy methods for backward compatibility
  // These maintain the original parameter order for existing code

  /**
   * @deprecated Use create() instead
   */
  createFromInput(date: moment.Moment | Date | string): moment.Moment {
    return this.create(date);
  }

  /**
   * @deprecated Use createUTC() instead
   */
  createUTCFromInput(date: moment.Moment | Date | string): moment.Moment {
    return this.createUTC(date);
  }

  /**
   * @deprecated Use add(amount, unit, date) instead
   */
  addToDate(
    date: moment.Moment | Date | string,
    amount: number,
    unit: moment.DurationInputArg2
  ): moment.Moment {
    return this.add(amount, unit, date);
  }

  /**
   * @deprecated Use subtract(amount, unit, date) instead
   */
  subtractFromDate(
    date: moment.Moment | Date | string,
    amount: number,
    unit: moment.DurationInputArg2
  ): moment.Moment {
    return this.subtract(amount, unit, date);
  }

  /**
   * @deprecated Use isAfter(date1, date2) instead
   */
  isAfterDates(
    date1: moment.Moment | Date | string,
    date2: moment.Moment | Date | string
  ): boolean {
    return this.isAfter(date1, date2);
  }

  /**
   * @deprecated Use isBefore(date1, date2) instead
   */
  isBeforeDates(
    date1: moment.Moment | Date | string,
    date2: moment.Moment | Date | string
  ): boolean {
    return this.isBefore(date1, date2);
  }

  /**
   * @deprecated Use isSameOrBefore(date1, date2) instead
   */
  isSameOrBeforeDates(
    date1: moment.Moment | Date | string,
    date2: moment.Moment | Date | string
  ): boolean {
    return this.isSameOrBefore(date1, date2);
  }

  /**
   * @deprecated Use isSameOrAfter(date1, date2) instead
   */
  isSameOrAfterDates(
    date1: moment.Moment | Date | string,
    date2: moment.Moment | Date | string
  ): boolean {
    return this.isSameOrAfter(date1, date2);
  }

  /**
   * @deprecated Use startOf(unit, date) instead
   */
  startOfDate(
    date: moment.Moment | Date | string,
    unit: moment.unitOfTime.StartOf
  ): moment.Moment {
    return this.startOf(unit, date);
  }

  /**
   * @deprecated Use endOf(unit, date) instead
   */
  endOfDate(
    date: moment.Moment | Date | string,
    unit: moment.unitOfTime.StartOf
  ): moment.Moment {
    return this.endOf(unit, date);
  }

  /**
   * @deprecated Use format(format, date) instead
   */
  formatDate(date: moment.Moment | Date | string, format: string): string {
    return this.format(format, date);
  }

  /**
   * @deprecated Use toDate(date) instead
   */
  toDateFromInput(date: moment.Moment | Date | string): Date {
    return this.toDate(date);
  }

  /**
   * @deprecated Use clone(date) instead
   */
  cloneDate(date: moment.Moment | Date | string): moment.Moment {
    return this.clone(date);
  }

  /**
   * @deprecated Use set(units, date) instead
   */
  setDateUnits(
    date: moment.Moment | Date | string,
    units: moment.MomentSetObject
  ): moment.Moment {
    return this.set(units, date);
  }

  /**
   * @deprecated Use diff(date1, date2, unit) instead
   */
  diffDates(
    date1: moment.Moment | Date | string,
    date2: moment.Moment | Date | string,
    unit: moment.DurationInputArg2 = "milliseconds"
  ): number {
    return this.diff(date1, date2, unit);
  }

  /**
   * @deprecated Use daysInMonth(date) instead
   */
  daysInMonthDate(date: moment.Moment | Date | string): number {
    return this.daysInMonth(date);
  }

  /**
   * @deprecated Use date(date) instead
   */
  dateFromInput(date: moment.Moment | Date | string): number {
    return this.date(date);
  }

  /**
   * @deprecated Use setDate(day, date) instead
   */
  setDateOnDate(
    date: moment.Moment | Date | string,
    day: number
  ): moment.Moment {
    return this.setDate(day, date);
  }
}

// Export a singleton instance for easy access
export const dateTimeService = DateTimeService.getInstance();
