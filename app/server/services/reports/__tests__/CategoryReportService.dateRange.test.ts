import { describe, it, expect } from "vitest";
import { resolveCategoryReportDateRange } from "../CategoryReportService";

describe("resolveCategoryReportDateRange", () => {
  it("advances dateTo by one day when dateTo is one day before dateFrom", () => {
    const { dateTo } = resolveCategoryReportDateRange("2024-01-10", "2024-01-09");
    expect(dateTo).toBe("2024-01-10");
  });

  it("clamps dateTo to dateFrom when still out of range after advance", () => {
    const { dateTo } = resolveCategoryReportDateRange("2024-01-10", "2024-01-08");
    expect(dateTo).toBe("2024-01-10");
  });

  it("leaves ordered range unchanged", () => {
    const { dateTo } = resolveCategoryReportDateRange("2024-01-01", "2024-01-31");
    expect(dateTo).toBe("2024-01-31");
  });

  it("returns same day when dateFrom equals dateTo", () => {
    const { dateTo } = resolveCategoryReportDateRange("2024-06-15", "2024-06-15");
    expect(dateTo).toBe("2024-06-15");
  });
});
