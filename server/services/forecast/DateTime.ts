import moment, {
  type Moment,
  type DurationInputArg2,
  type unitOfTime,
  type MomentSetObject,
} from "moment";

/**
 * Custom DateTime class that wraps moment functionality
 * Provides a cleaner interface and can be used globally
 */
export class DateTime {
  private _moment: Moment;

  constructor(input?: Moment | Date | string | DateTime) {
    if (input instanceof DateTime) {
      this._moment = input._moment.clone();
    } else if (input) {
      this._moment = moment(input);
    } else {
      this._moment = moment();
    }
  }

  // Factory methods
  static now(): DateTime {
    return new DateTime();
  }

  static from(input: Moment | Date | string | DateTime): DateTime {
    return new DateTime(input);
  }

  static parse(dateString: string, format: string): DateTime {
    return new DateTime(moment(dateString, format));
  }

  // Conversion methods
  toDate(): Date {
    return this._moment.toDate();
  }

  toMoment(): Moment {
    return this._moment.clone();
  }

  clone(): DateTime {
    return new DateTime(this._moment.clone());
  }

  // Formatting
  format(formatString: string): string {
    return this._moment.format(formatString);
  }

  // Arithmetic operations
  add(amount: number, unit: DurationInputArg2): DateTime {
    return new DateTime(this._moment.add(amount, unit));
  }

  subtract(amount: number, unit: DurationInputArg2): DateTime {
    return new DateTime(this._moment.subtract(amount, unit));
  }

  // Comparison methods
  isAfter(other: DateTime | Date | string): boolean {
    const otherMoment =
      other instanceof DateTime ? other._moment : moment(other);
    return this._moment.isAfter(otherMoment);
  }

  isBefore(other: DateTime | Date | string): boolean {
    const otherMoment =
      other instanceof DateTime ? other._moment : moment(other);
    return this._moment.isBefore(otherMoment);
  }

  isSame(other: DateTime | Date | string): boolean {
    const otherMoment =
      other instanceof DateTime ? other._moment : moment(other);
    return this._moment.isSame(otherMoment);
  }

  isSameOrBefore(other: DateTime | Date | string): boolean {
    const otherMoment =
      other instanceof DateTime ? other._moment : moment(other);
    return this._moment.isSameOrBefore(otherMoment);
  }

  isSameOrAfter(other: DateTime | Date | string): boolean {
    const otherMoment =
      other instanceof DateTime ? other._moment : moment(other);
    return this._moment.isSameOrAfter(otherMoment);
  }

  // Start/End of time periods
  startOf(unit: unitOfTime.StartOf): DateTime {
    return new DateTime(this._moment.startOf(unit));
  }

  endOf(unit: unitOfTime.StartOf): DateTime {
    return new DateTime(this._moment.endOf(unit));
  }

  // Setting values
  set(units: MomentSetObject): DateTime {
    return new DateTime(this._moment.set(units));
  }

  // Utility methods
  diff(
    other: DateTime | Date | string,
    unit: DurationInputArg2 = "milliseconds"
  ): number {
    const otherMoment =
      other instanceof DateTime ? other._moment : moment(other);
    return this._moment.diff(otherMoment, unit);
  }

  isValid(): boolean {
    return this._moment.isValid();
  }

  daysInMonth(): number {
    return this._moment.daysInMonth();
  }

  // Getter methods for date components
  hour(): number {
    return this._moment.hour();
  }

  minute(): number {
    return this._moment.minute();
  }

  second(): number {
    return this._moment.second();
  }

  millisecond(): number {
    return this._moment.millisecond();
  }

  // Setter methods for date components (return DateTime for chaining)
  setYear(year: number): DateTime {
    return new DateTime(this._moment.year(year));
  }

  setMonth(month: number): DateTime {
    return new DateTime(this._moment.month(month));
  }

  setDate(day: number): DateTime {
    return new DateTime(this._moment.date(day));
  }

  setHour(hour: number): DateTime {
    return new DateTime(this._moment.hour(hour));
  }

  setMinute(minute: number): DateTime {
    return new DateTime(this._moment.minute(minute));
  }

  setSecond(second: number): DateTime {
    return new DateTime(this._moment.second(second));
  }

  setMillisecond(millisecond: number): DateTime {
    return new DateTime(this._moment.millisecond(millisecond));
  }

  // Alias methods for backward compatibility and chaining
  year(year?: number): DateTime | number {
    if (year !== undefined) {
      return new DateTime(this._moment.year(year));
    }
    return this._moment.year();
  }

  month(month?: number): DateTime | number {
    if (month !== undefined) {
      return new DateTime(this._moment.month(month));
    }
    return this._moment.month();
  }

  date(day?: number): DateTime | number {
    if (day !== undefined) {
      return new DateTime(this._moment.date(day));
    }
    return this._moment.date();
  }

  // Get day of week (0 = Sunday, 6 = Saturday)
  day(): number {
    return this._moment.day();
  }

  // UTC methods
  utc(): DateTime {
    return new DateTime(this._moment.utc());
  }

  // String representation
  toString(): string {
    return this._moment.toString();
  }

  // JSON serialization
  toJSON(): string {
    return this._moment.toJSON();
  }

  // ISO string representation
  toISOString(): string {
    return this._moment.toISOString();
  }

  // Value for comparison
  valueOf(): number {
    return this._moment.valueOf();
  }
}

// Export types for compatibility
export type { DurationInputArg2, unitOfTime, MomentSetObject };
