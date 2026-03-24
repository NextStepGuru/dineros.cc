import { describe, it, expect } from "vitest";
import {
  parseAsUTC,
  getTodayFromTestDate,
} from "../getTodayFromTestDate";

describe("getTodayFromTestDate", () => {
  describe("parseAsUTC", () => {
    it("returns date for ISO date string without timezone", () => {
      const d = parseAsUTC("2024-06-15");
      expect(d.toISOString().startsWith("2024-06-15")).toBe(true);
    });

    it("appends Z when no timezone given", () => {
      const d = parseAsUTC("2024-01-01");
      expect(d.getUTCDate()).toBe(1);
      expect(d.getUTCMonth()).toBe(0);
      expect(d.getUTCFullYear()).toBe(2024);
    });

    it("handles string with Z suffix", () => {
      const d = parseAsUTC("2024-03-10Z");
      expect(d.getUTCFullYear()).toBe(2024);
      expect(d.getUTCMonth()).toBe(2);
      expect(d.getUTCDate()).toBe(10);
    });

    it("trims whitespace", () => {
      const d = parseAsUTC("  2024-02-20  ");
      expect(d.getUTCFullYear()).toBe(2024);
      expect(d.getUTCDate()).toBe(20);
    });

    it("returns current date for empty string", () => {
      const before = Date.now();
      const d = parseAsUTC("");
      const after = Date.now();
      expect(d.getTime()).toBeGreaterThanOrEqual(before);
      expect(d.getTime()).toBeLessThanOrEqual(after + 5);
    });

    it("returns current date for invalid string", () => {
      const d = parseAsUTC("not-a-date");
      expect(Number.isNaN(d.getTime())).toBe(false);
    });
  });

  describe("getTodayFromTestDate", () => {
    it("returns today and YYYY-MM-DD when testDateStr is undefined", () => {
      const { today, todayISOString } = getTodayFromTestDate(undefined);
      expect(today).toBeInstanceOf(Date);
      expect(todayISOString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(today.toISOString().substring(0, 10)).toBe(todayISOString);
    });

    it("returns parsed date and ISO date string when testDateStr provided", () => {
      const { today, todayISOString } = getTodayFromTestDate("2024-12-25");
      expect(today.getUTCFullYear()).toBe(2024);
      expect(today.getUTCMonth()).toBe(11);
      expect(today.getUTCDate()).toBe(25);
      expect(todayISOString).toBe("2024-12-25");
    });

    it("returns consistent today and todayISOString", () => {
      const { today, todayISOString } = getTodayFromTestDate("2023-07-04");
      expect(today.toISOString().substring(0, 10)).toBe(todayISOString);
    });
  });
});
