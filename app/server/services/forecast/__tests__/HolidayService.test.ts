import { describe, expect, it } from "vitest";
import { HolidayService } from "../HolidayService";

function utc(dateIso: string): Date {
  return new Date(`${dateIso}T12:00:00.000Z`);
}

describe("HolidayService", () => {
  const service = new HolidayService();

  it("recognizes fixed-date federal holidays", () => {
    expect(service.isHoliday(utc("2024-01-01"))).toBe(true); // New Year's Day
    expect(service.isHoliday(utc("2024-06-19"))).toBe(true); // Juneteenth
    expect(service.isHoliday(utc("2024-07-04"))).toBe(true); // Independence Day
    expect(service.isHoliday(utc("2024-11-11"))).toBe(true); // Veterans Day
    expect(service.isHoliday(utc("2024-12-25"))).toBe(true); // Christmas
  });

  it("recognizes floating federal holidays for 2024", () => {
    expect(service.isHoliday(utc("2024-01-15"))).toBe(true); // MLK Day (3rd Mon)
    expect(service.isHoliday(utc("2024-02-19"))).toBe(true); // Presidents' Day (3rd Mon)
    expect(service.isHoliday(utc("2024-05-27"))).toBe(true); // Memorial Day (last Mon)
    expect(service.isHoliday(utc("2024-09-02"))).toBe(true); // Labor Day (1st Mon)
    expect(service.isHoliday(utc("2024-10-14"))).toBe(true); // Columbus Day (2nd Mon)
    expect(service.isHoliday(utc("2024-11-28"))).toBe(true); // Thanksgiving (4th Thu)
  });

  it("marks the Friday observation of a Saturday holiday", () => {
    // 2020-07-04 was a Saturday → observed Friday 2020-07-03
    expect(service.isHoliday(utc("2020-07-03"))).toBe(true);
    expect(service.isHoliday(utc("2020-07-04"))).toBe(true);
    expect(service.isHoliday(utc("2020-07-02"))).toBe(false);
  });

  it("marks the Monday observation of a Sunday holiday", () => {
    // 2022-12-25 was a Sunday → observed Monday 2022-12-26
    expect(service.isHoliday(utc("2022-12-26"))).toBe(true);
    expect(service.isHoliday(utc("2022-12-25"))).toBe(true);
    expect(service.isHoliday(utc("2022-12-27"))).toBe(false);
  });

  it("captures a next-year New Year's Day observed on New Year's Eve", () => {
    // 2028-01-01 is a Saturday → observed Friday 2027-12-31
    expect(service.isHoliday(utc("2027-12-31"))).toBe(true);
    expect(service.isHoliday(utc("2028-01-01"))).toBe(true);
  });

  it("does not mark ordinary weekdays", () => {
    expect(service.isHoliday(utc("2024-03-05"))).toBe(false);
    expect(service.isHoliday(utc("2024-04-15"))).toBe(false);
    expect(service.isHoliday(utc("2024-12-26"))).toBe(false);
  });

  it("caches per year but still answers across multiple years", () => {
    expect(service.isHoliday(utc("2025-01-01"))).toBe(true);
    expect(service.isHoliday(utc("2025-07-04"))).toBe(true);
    expect(service.isHoliday(utc("2025-11-27"))).toBe(true); // Thanksgiving 2025
    expect(service.isHoliday(utc("2025-03-03"))).toBe(false);
  });
});
