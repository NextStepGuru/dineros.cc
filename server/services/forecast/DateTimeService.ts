import moment from "moment";

/**
 * Centralized date/time service that can be overridden for testing
 * This allows us to control the "now" time in tests and ensure consistent behavior
 */
export class DateTimeService {
  private static _instance: DateTimeService | null = null;
  private _nowOverride: moment.Moment | null = null;

  private constructor() {
    // Hardcoded override - set to July 20th at 11:32pm CDT
    // this._nowOverride = moment("2025-08-21T00:10:00-05:00");
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
    return moment();
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
    this._nowOverride = moment(date);
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
}

// Export a singleton instance for easy access
export const dateTimeService = DateTimeService.getInstance();
