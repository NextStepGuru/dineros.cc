import { describe, it, expect, afterEach } from "vitest";
import { dateTimeService } from "../DateTimeService";

describe("DateTimeService", () => {
  afterEach(() => {
    // Clear any overrides after each test
    dateTimeService.clearNowOverride();
  });

  it("should return current time when no override is set", () => {
    const now = dateTimeService.now();
    const nowDate = dateTimeService.nowDate();

    expect(now).toBeDefined();
    expect(nowDate).toBeInstanceOf(Date);

    // Should be within a few seconds of each other
    const diff = Math.abs(now.valueOf() - dateTimeService.now().valueOf());
    expect(diff).toBeLessThan(1000);
  });

  it("should return override time when set", () => {
    const overrideDate = dateTimeService.create("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(overrideDate);

    const now = dateTimeService.now();
    const nowDate = dateTimeService.nowDate();

    expect(now.isSame(overrideDate)).toBe(true);
    expect(nowDate.getTime()).toBe(overrideDate.toDate().getTime());
  });

  it("should clear override when requested", () => {
    const overrideDate = dateTimeService.create("2024-01-15T10:30:00Z");
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
    expect(dateTimeService.now().isSame(dateTimeService.create(dateObj))).toBe(
      true,
    );

    // Test with string
    const dateString = "2024-01-15T10:30:00Z";
    dateTimeService.setNowOverride(dateString);
    expect(
      dateTimeService.now().isSame(dateTimeService.create(dateString)),
    ).toBe(true);

    // Test with DateTime object
    const dateTimeObj = dateTimeService.create("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(dateTimeObj);
    expect(dateTimeService.now().isSame(dateTimeObj)).toBe(true);
  });

  it("should return cloned DateTime objects to prevent mutation", () => {
    const overrideDate = dateTimeService.create("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(overrideDate);

    const now1 = dateTimeService.now();
    const now2 = dateTimeService.now();

    // Modifying one should not affect the other
    const mutatedNow1 = now1.add(1, "day");
    expect(now2.isSame(overrideDate)).toBe(true);
    expect(mutatedNow1.isSame(overrideDate)).toBe(false);
  });
});
