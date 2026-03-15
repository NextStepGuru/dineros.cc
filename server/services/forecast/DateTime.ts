/** Full ISO datetime with Z or offset - required to avoid ambiguous local interpretation */
const HAS_EXPLICIT_OFFSET = /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
/** Date-only YYYY-MM-DD; safe to interpret in a given timezone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type CanonicalDurationUnit =
  | "year"
  | "month"
  | "week"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "millisecond";

type DateTimeInput = DateTime | Date | string | number;
type DurationObjectInput = Partial<Record<CanonicalDurationUnit, number>>;

export type DurationInputArg2 =
  | CanonicalDurationUnit
  | "years"
  | "y"
  | "months"
  | "M"
  | "weeks"
  | "w"
  | "days"
  | "d"
  | "hours"
  | "h"
  | "minutes"
  | "m"
  | "seconds"
  | "s"
  | "milliseconds"
  | "ms";

export namespace unitOfTime {
  export type StartOf =
    | "year"
    | "month"
    | "week"
    | "day"
    | "hour"
    | "minute"
    | "second";
}

export type MomentSetObject = Partial<{
  year: number;
  month: number;
  date: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  milliseconds: number;
}>;

function normalizeUnit(unit: DurationInputArg2): CanonicalDurationUnit {
  switch (unit) {
    case "year":
    case "years":
    case "y":
      return "year";
    case "month":
    case "months":
    case "M":
      return "month";
    case "week":
    case "weeks":
    case "w":
      return "week";
    case "day":
    case "days":
    case "d":
      return "day";
    case "hour":
    case "hours":
    case "h":
      return "hour";
    case "minute":
    case "minutes":
    case "m":
      return "minute";
    case "second":
    case "seconds":
    case "s":
      return "second";
    case "millisecond":
    case "milliseconds":
    case "ms":
      return "millisecond";
    default:
      return "millisecond";
  }
}

function daysInMonthUTC(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

function toDate(input?: DateTimeInput): Date {
  if (input instanceof DateTime) return new Date(input.valueOf());
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === "number") return new Date(input);
  if (typeof input === "string") return new Date(input);
  return new Date();
}

function pad(value: number, len = 2): string {
  return String(value).padStart(len, "0");
}

function formatDateUTC(date: Date, formatString: string): string {
  const replacements: Record<string, string> = {
    YYYY: String(date.getUTCFullYear()),
    MM: pad(date.getUTCMonth() + 1),
    DD: pad(date.getUTCDate()),
    HH: pad(date.getUTCHours()),
    mm: pad(date.getUTCMinutes()),
    ss: pad(date.getUTCSeconds()),
    SSS: pad(date.getUTCMilliseconds(), 3),
    dddd: DAY_NAMES[date.getUTCDay()],
    M: String(date.getUTCMonth() + 1),
    D: String(date.getUTCDate()),
    H: String(date.getUTCHours()),
    m: String(date.getUTCMinutes()),
    s: String(date.getUTCSeconds()),
  };

  return formatString.replace(
    /YYYY|dddd|SSS|MM|DD|HH|mm|ss|M|D|H|m|s/g,
    (token) => replacements[token] ?? token
  );
}

/**
 * Custom DateTime class backed by native Date in UTC semantics.
 * Use DateTimeService for all server-side datetime to respect run context and UTC boundaries.
 */
export class DateTime {
  private _date: Date;

  constructor(input?: DateTimeInput) {
    this._date = toDate(input);
  }

  static now(): DateTime {
    return new DateTime();
  }

  static from(input: DateTimeInput): DateTime {
    return new DateTime(input);
  }

  static parse(dateString: string, format: string): DateTime {
    const trimmed = dateString.trim();
    if (format === "YYYY-MM-DD") {
      const [year, month, day] = trimmed.split("-").map(Number);
      return new DateTime(new Date(Date.UTC(year, month - 1, day)));
    }
    if (format === "YYYY-MM-DD HH:mm:ss") {
      const [datePart, timePart] = trimmed.split(" ");
      const [year, month, day] = datePart.split("-").map(Number);
      const [hour, minute, second] = timePart.split(":").map(Number);
      return new DateTime(
        new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0))
      );
    }
    return new DateTime(trimmed);
  }

  static parseUTC(input: string | Date): DateTime {
    if (input instanceof Date) {
      return new DateTime(new Date(input.getTime()));
    }
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) return new DateTime(parsed);
    return new DateTime(new Date(Number.NaN));
  }

  static hasExplicitOffset(value: string): boolean {
    return HAS_EXPLICIT_OFFSET.test(value.trim());
  }

  static isDateOnly(value: string): boolean {
    return DATE_ONLY.test(value.trim());
  }

  toDate(): Date {
    return new Date(this._date.getTime());
  }

  clone(): DateTime {
    return new DateTime(this._date);
  }

  format(formatString: string): string {
    return formatDateUTC(this._date, formatString);
  }

  add(_amount: number, _unit: DurationInputArg2): DateTime;
  add(_duration: DurationObjectInput): DateTime;
  add(
    amountOrDuration: number | DurationObjectInput,
    unit?: DurationInputArg2
  ): DateTime {
    if (
      typeof amountOrDuration === "object" &&
      amountOrDuration !== null &&
      !Array.isArray(amountOrDuration)
    ) {
      let chained = this.clone();
      const orderedUnits: CanonicalDurationUnit[] = [
        "year",
        "month",
        "week",
        "day",
        "hour",
        "minute",
        "second",
        "millisecond",
      ];
      for (const u of orderedUnits) {
        const v = amountOrDuration[u];
        if (typeof v === "number" && Number.isFinite(v) && v !== 0) {
          chained = chained.add(v, u);
        }
      }
      return chained;
    }

    const amount = amountOrDuration;
    const resolvedUnit: DurationInputArg2 = unit ?? "millisecond";
    const next = this.toDate();
    const normalized = normalizeUnit(resolvedUnit);
    switch (normalized) {
      case "year":
        {
          const year = next.getUTCFullYear() + amount;
          const month = next.getUTCMonth();
          const day = Math.min(next.getUTCDate(), daysInMonthUTC(year, month));
          next.setUTCFullYear(year, month, day);
        }
        break;
      case "month":
        {
          const currentYear = next.getUTCFullYear();
          const currentMonth = next.getUTCMonth();
          const currentDay = next.getUTCDate();
          const absoluteMonths = currentYear * 12 + currentMonth + amount;
          const targetYear = Math.floor(absoluteMonths / 12);
          const targetMonth = ((absoluteMonths % 12) + 12) % 12;
          const targetDay = Math.min(
            currentDay,
            daysInMonthUTC(targetYear, targetMonth)
          );
          next.setUTCFullYear(targetYear, targetMonth, targetDay);
        }
        break;
      case "week":
        next.setUTCDate(next.getUTCDate() + amount * 7);
        break;
      case "day":
        next.setUTCDate(next.getUTCDate() + amount);
        break;
      case "hour":
        next.setUTCHours(next.getUTCHours() + amount);
        break;
      case "minute":
        next.setUTCMinutes(next.getUTCMinutes() + amount);
        break;
      case "second":
        next.setUTCSeconds(next.getUTCSeconds() + amount);
        break;
      case "millisecond":
        next.setUTCMilliseconds(next.getUTCMilliseconds() + amount);
        break;
      default:
        break;
    }
    return new DateTime(next);
  }

  subtract(amount: number, unit: DurationInputArg2): DateTime {
    return this.add(-amount, unit);
  }

  private resolveOther(other: DateTime | Date | string): Date {
    return toDate(other);
  }

  isAfter(other: DateTime | Date | string): boolean {
    return this.valueOf() > this.resolveOther(other).getTime();
  }

  isBefore(other: DateTime | Date | string): boolean {
    return this.valueOf() < this.resolveOther(other).getTime();
  }

  isSame(other: DateTime | Date | string): boolean {
    return this.valueOf() === this.resolveOther(other).getTime();
  }

  isSameOrBefore(other: DateTime | Date | string): boolean {
    return this.valueOf() <= this.resolveOther(other).getTime();
  }

  isSameOrAfter(other: DateTime | Date | string): boolean {
    return this.valueOf() >= this.resolveOther(other).getTime();
  }

  startOf(unit: unitOfTime.StartOf): DateTime {
    const d = this.toDate();
    switch (unit) {
      case "year":
        d.setUTCMonth(0, 1);
        d.setUTCHours(0, 0, 0, 0);
        break;
      case "month":
        d.setUTCDate(1);
        d.setUTCHours(0, 0, 0, 0);
        break;
      case "week": {
        const day = d.getUTCDay();
        d.setUTCDate(d.getUTCDate() - day);
        d.setUTCHours(0, 0, 0, 0);
        break;
      }
      case "day":
        d.setUTCHours(0, 0, 0, 0);
        break;
      case "hour":
        d.setUTCMinutes(0, 0, 0);
        break;
      case "minute":
        d.setUTCSeconds(0, 0);
        break;
      case "second":
        d.setUTCMilliseconds(0);
        break;
      default:
        break;
    }
    return new DateTime(d);
  }

  endOf(unit: unitOfTime.StartOf): DateTime {
    const d = this.startOf(unit).toDate();
    switch (unit) {
      case "year":
        d.setUTCFullYear(d.getUTCFullYear() + 1);
        break;
      case "month":
        d.setUTCMonth(d.getUTCMonth() + 1);
        break;
      case "week":
        d.setUTCDate(d.getUTCDate() + 7);
        break;
      case "day":
        d.setUTCDate(d.getUTCDate() + 1);
        break;
      case "hour":
        d.setUTCHours(d.getUTCHours() + 1);
        break;
      case "minute":
        d.setUTCMinutes(d.getUTCMinutes() + 1);
        break;
      case "second":
        d.setUTCSeconds(d.getUTCSeconds() + 1);
        break;
      default:
        break;
    }
    d.setUTCMilliseconds(d.getUTCMilliseconds() - 1);
    return new DateTime(d);
  }

  set(units: MomentSetObject): DateTime {
    const d = this.toDate();
    if (units.year !== undefined) d.setUTCFullYear(units.year);
    if (units.month !== undefined) d.setUTCMonth(units.month);
    if (units.date !== undefined) d.setUTCDate(units.date);
    if (units.hour !== undefined) d.setUTCHours(units.hour);
    if (units.minute !== undefined) d.setUTCMinutes(units.minute);
    if (units.second !== undefined) d.setUTCSeconds(units.second);
    if (units.millisecond !== undefined) d.setUTCMilliseconds(units.millisecond);
    if (units.milliseconds !== undefined) d.setUTCMilliseconds(units.milliseconds);
    return new DateTime(d);
  }

  diff(
    other: DateTime | Date | string,
    unit: DurationInputArg2 = "milliseconds"
  ): number {
    const lhs = this.valueOf();
    const rhs = this.resolveOther(other).getTime();
    const delta = lhs - rhs;
    switch (normalizeUnit(unit)) {
      case "year":
        return this.year() - new DateTime(other).year();
      case "month":
        return (
          (this.year() as number) * 12 +
          (this.month() as number) -
          ((new DateTime(other).year() as number) * 12 +
            (new DateTime(other).month() as number))
        );
      case "week":
        return Math.trunc(delta / (7 * 24 * 60 * 60 * 1000));
      case "day":
        return Math.trunc(delta / (24 * 60 * 60 * 1000));
      case "hour":
        return Math.trunc(delta / (60 * 60 * 1000));
      case "minute":
        return Math.trunc(delta / (60 * 1000));
      case "second":
        return Math.trunc(delta / 1000);
      case "millisecond":
      default:
        return delta;
    }
  }

  isValid(): boolean {
    return !Number.isNaN(this._date.getTime());
  }

  daysInMonth(): number {
    return daysInMonthUTC(this._date.getUTCFullYear(), this._date.getUTCMonth());
  }

  hour(): number {
    return this._date.getUTCHours();
  }

  minute(): number {
    return this._date.getUTCMinutes();
  }

  second(): number {
    return this._date.getUTCSeconds();
  }

  millisecond(): number {
    return this._date.getUTCMilliseconds();
  }

  setYear(year: number): DateTime {
    return this.set({ year });
  }

  setMonth(month: number): DateTime {
    return this.set({ month });
  }

  setDate(day: number): DateTime {
    return this.set({ date: day });
  }

  setHour(hour: number): DateTime {
    return this.set({ hour });
  }

  setMinute(minute: number): DateTime {
    return this.set({ minute });
  }

  setSecond(second: number): DateTime {
    return this.set({ second });
  }

  setMillisecond(millisecond: number): DateTime {
    return this.set({ millisecond });
  }

  year(year?: number): DateTime | number {
    if (year !== undefined) return this.setYear(year);
    return this._date.getUTCFullYear();
  }

  month(month?: number): DateTime | number {
    if (month !== undefined) return this.setMonth(month);
    return this._date.getUTCMonth();
  }

  date(day?: number): DateTime | number {
    if (day !== undefined) return this.setDate(day);
    return this._date.getUTCDate();
  }

  day(): number {
    return this._date.getUTCDay();
  }

  utc(): DateTime {
    return this.clone();
  }

  startOfDayUTC(): DateTime {
    return this.startOf("day");
  }

  endOfDayUTC(): DateTime {
    return this.endOf("day");
  }

  toString(): string {
    return this._date.toUTCString();
  }

  toJSON(): string {
    return this._date.toJSON();
  }

  toISOString(): string {
    return this._date.toISOString();
  }

  valueOf(): number {
    return this._date.getTime();
  }
}
