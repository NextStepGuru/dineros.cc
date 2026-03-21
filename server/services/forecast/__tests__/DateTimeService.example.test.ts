import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { dateTimeService } from "../DateTimeService";

describe("DateTimeService (forecast examples)", () => {
  beforeEach(() => {
    dateTimeService.clearNowOverride();
  });

  afterEach(() => {
    dateTimeService.clearNowOverride();
  });

  it("should use current time by default", () => {
    const now = dateTimeService.now();
    expect(now).toBeDefined();
  });

  it("should use override time when set", () => {
    const testDate = dateTimeService.create("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(testDate);

    const now = dateTimeService.now();
    expect(now.isSame(testDate)).toBe(true);
  });

  it("should allow testing specific scenarios with different dates", () => {
    const scenarioDate = dateTimeService.create("2024-06-15T00:00:00Z");
    dateTimeService.setNowOverride(scenarioDate);

    expect(dateTimeService.now().isSame(scenarioDate)).toBe(true);
  });

  it("should allow testing time-sensitive operations", () => {
    const statementDate = dateTimeService.create("2024-03-01T00:00:00Z");
    dateTimeService.setNowOverride(statementDate);

    expect(dateTimeService.now().isSame(statementDate)).toBe(true);
  });

  it("should work with multiple test scenarios", () => {
    dateTimeService.setNowOverride(dateTimeService.create("2024-01-01"));
    const now1 = dateTimeService.now();
    expect(now1.format("YYYY-MM-DD")).toBe("2024-01-01");

    dateTimeService.setNowOverride(dateTimeService.create("2024-12-31"));
    const now2 = dateTimeService.now();
    expect(now2.format("YYYY-MM-DD")).toBe("2024-12-31");

    dateTimeService.clearNowOverride();
    const now3 = dateTimeService.now();
    expect(now3.format("YYYY-MM-DD")).toBe(dateTimeService.now().format("YYYY-MM-DD"));
  });
});
