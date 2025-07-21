import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { dateTimeService } from "../DateTimeService";
import { ForecastEngine } from "../ForecastEngine";
import moment from "moment";

describe("ForecastEngine with DateTimeService", () => {
  // Mock PrismaClient for testing
  const mockDb = {} as any;

  beforeEach(() => {
    // Clear any existing overrides
    dateTimeService.clearNowOverride();
  });

  afterEach(() => {
    // Always clear overrides after tests
    dateTimeService.clearNowOverride();
  });

  it("should use current time by default", () => {
    const engine = new ForecastEngine(mockDb);

    // The engine should use the current time when no override is set
    const now = dateTimeService.now();
    expect(now).toBeInstanceOf(moment);
  });

  it("should use override time when set", () => {
    // Set a specific date for testing
    const testDate = moment("2024-01-15T10:30:00Z");
    dateTimeService.setNowOverride(testDate);

    const engine = new ForecastEngine(mockDb);

    // Now all date/time operations in the engine will use the override
    const now = dateTimeService.now();
    expect(now.isSame(testDate)).toBe(true);
  });

  it("should allow testing specific scenarios with different dates", () => {
    // Test scenario: What happens on a specific date
    const scenarioDate = moment("2024-06-15T00:00:00Z");
    dateTimeService.setNowOverride(scenarioDate);

    // Now you can test how the forecast engine behaves on June 15, 2024
    // All date calculations will be based on this date instead of the current date

    const engine = new ForecastEngine(mockDb);
    // ... test your forecast logic with the fixed date
  });

  it("should allow testing time-sensitive operations", () => {
    // Test interest calculations on a specific statement date
    const statementDate = moment("2024-03-01T00:00:00Z");
    dateTimeService.setNowOverride(statementDate);

    // Now test interest calculations that depend on the current date
    // They will all use March 1, 2024 as the "current" date
  });

  it("should work with multiple test scenarios", () => {
    // Scenario 1: Test on January 1st
    dateTimeService.setNowOverride(moment("2024-01-01T00:00:00Z"));
    let now1 = dateTimeService.now();
    expect(now1.format("YYYY-MM-DD")).toBe("2024-01-01");

    // Scenario 2: Test on December 31st
    dateTimeService.setNowOverride(moment("2024-12-31T00:00:00Z"));
    let now2 = dateTimeService.now();
    expect(now2.format("YYYY-MM-DD")).toBe("2024-12-31");

    // Clear override and return to current time
    dateTimeService.clearNowOverride();
    let now3 = dateTimeService.now();
    expect(now3.format("YYYY-MM-DD")).toBe(moment().format("YYYY-MM-DD"));
  });
});
