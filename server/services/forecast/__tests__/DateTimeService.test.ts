import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DateTimeService, dateTimeService } from "../DateTimeService";
import moment from "moment";

describe("DateTimeService", () => {
  let originalInstance: DateTimeService;

  beforeEach(() => {
    // Store the original instance
    originalInstance = DateTimeService.getInstance();
  });

  afterEach(() => {
    // Clear any overrides after each test
    dateTimeService.clearNowOverride();
  });

  it("should return current time when no override is set", () => {
    const now = dateTimeService.now();
    const nowDate = dateTimeService.nowDate();

    expect(now).toBeInstanceOf(moment);
    expect(nowDate).toBeInstanceOf(Date);

    // Should be within a few seconds of each other
    const diff = Math.abs(now.valueOf() - moment().valueOf());
    expect(diff).toBeLessThan(1000);
  });

  it("should return override time when set", () => {
    const overrideDate = moment("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(overrideDate);

    const now = dateTimeService.now();
    const nowDate = dateTimeService.nowDate();

    expect(now.isSame(overrideDate)).toBe(true);
    expect(nowDate.getTime()).toBe(overrideDate.toDate().getTime());
  });

  it("should clear override when requested", () => {
    const overrideDate = moment("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(overrideDate);

    expect(dateTimeService.hasOverride()).toBe(true);
    expect(dateTimeService.getOverride()?.isSame(overrideDate)).toBe(true);

    dateTimeService.clearNowOverride();

    expect(dateTimeService.hasOverride()).toBe(false);
    expect(dateTimeService.getOverride()).toBe(null);
  });

  it("should accept different date formats for override", () => {
    // Test with Date object
    const dateObj = new Date("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(dateObj);
    expect(dateTimeService.now().isSame(moment(dateObj))).toBe(true);

    // Test with string
    const dateString = "2024-01-15T10:30:00Z";
    dateTimeService.setNowOverride(dateString);
    expect(dateTimeService.now().isSame(moment(dateString))).toBe(true);

    // Test with moment object
    const momentObj = moment("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(momentObj);
    expect(dateTimeService.now().isSame(momentObj)).toBe(true);
  });

  it("should return cloned moment objects to prevent mutation", () => {
    const overrideDate = moment("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(overrideDate);

    const now1 = dateTimeService.now();
    const now2 = dateTimeService.now();

    // Modifying one should not affect the other
    now1.add(1, "day");
    expect(now2.isSame(overrideDate)).toBe(true);
    expect(now1.isSame(overrideDate)).toBe(false);
  });
});
