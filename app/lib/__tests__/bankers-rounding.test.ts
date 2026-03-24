import { describe, it, expect } from "vitest";
import {
  roundToCents,
  toMonetaryDecimal,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  calculatePercentage,
  calculateCompoundInterest,
  calculateSimpleInterest,
  formatMoney,
  isValidMonetaryValue,
  normalizeMonetaryValue,
  isMonetaryEqual,
  absoluteMoney,
  maxMoney,
  minMoney,
  sumMoney,
} from "../bankers-rounding";
import prismaPkg from "@prisma/client";

const { Prisma } = prismaPkg;

describe("Bankers Rounding Utility", () => {
  describe("roundToCents", () => {
    it("should round using bankers rounding (round half to even)", () => {
      // Test bankers rounding specifically
      expect(roundToCents(2.125)).toBe(2.12); // Round down to even
      expect(roundToCents(2.135)).toBe(2.14); // Round up to even
      expect(roundToCents(2.145)).toBe(2.14); // Round down to even
      expect(roundToCents(2.155)).toBe(2.16); // Round up to even
    });

    it("should handle regular rounding cases", () => {
      expect(roundToCents(2.11)).toBe(2.11);
      expect(roundToCents(2.119)).toBe(2.12);
      expect(roundToCents(2.121)).toBe(2.12);
    });

    it("should handle negative values", () => {
      expect(roundToCents(-2.125)).toBe(-2.12);
      expect(roundToCents(-2.135)).toBe(-2.14);
    });

    it("should handle string inputs", () => {
      expect(roundToCents("2.125")).toBe(2.12);
      expect(roundToCents("10.555")).toBe(10.56);
    });

    it("should handle Decimal inputs", () => {
      expect(roundToCents(new Prisma.Decimal("2.125"))).toBe(2.12);
      expect(roundToCents(new Prisma.Decimal("10.555"))).toBe(10.56);
    });

    it("should throw error for invalid inputs", () => {
      expect(() => roundToCents("invalid")).toThrow("Invalid monetary value");
      expect(() => roundToCents(NaN)).toThrow("Invalid monetary value");
    });
  });

  describe("toMonetaryDecimal", () => {
    it("should convert to Decimal with proper precision", () => {
      const result = toMonetaryDecimal(2.125);
      expect(result.toString()).toBe("2.12");
      expect(result).toBeInstanceOf(Prisma.Decimal);
    });

    it("should handle various input types", () => {
      expect(toMonetaryDecimal(10.555).toString()).toBe("10.56");
      expect(toMonetaryDecimal("10.555").toString()).toBe("10.56");
      expect(toMonetaryDecimal(new Prisma.Decimal("10.555")).toString()).toBe("10.56");
    });
  });

  describe("addMoney", () => {
    it("should add monetary values with proper rounding", () => {
      expect(addMoney(10.125, 5.125)).toBe(15.25); // 10.12 + 5.12 = 15.24, but 10.125 + 5.125 = 15.25
      expect(addMoney(1.11, 2.22)).toBe(3.33);
      expect(addMoney(0.01, 0.01)).toBe(0.02);
    });

    it("should handle mixed input types", () => {
      expect(addMoney("10.125", 5.125)).toBe(15.25);
      expect(addMoney(new Prisma.Decimal("10.11"), "5.22")).toBe(15.33);
    });
  });

  describe("subtractMoney", () => {
    it("should subtract monetary values with proper rounding", () => {
      expect(subtractMoney(10.0, 5.125)).toBe(4.88); // 10.00 - 5.12 = 4.88
      expect(subtractMoney(100.555, 50.125)).toBe(50.43); // 100.56 - 50.12 = 50.44, but raw: 100.555 - 50.125 = 50.43
    });

    it("should handle negative results", () => {
      expect(subtractMoney(5.0, 10.0)).toBe(-5.0);
    });
  });

  describe("multiplyMoney", () => {
    it("should multiply monetary values with proper rounding", () => {
      expect(multiplyMoney(10.125, 2)).toBe(20.25);
      expect(multiplyMoney(3.33, 3)).toBe(9.99);
      expect(multiplyMoney(10.125, 0.1)).toBe(1.01); // 10.125 * 0.1 = 1.0125 -> 1.01
    });

    it("should handle fractional multipliers", () => {
      expect(multiplyMoney(100, 0.05)).toBe(5.0); // 5% of 100
      expect(multiplyMoney(1000, 0.0025)).toBe(2.5); // 0.25% of 1000
    });
  });

  describe("divideMoney", () => {
    it("should divide monetary values with proper rounding", () => {
      expect(divideMoney(10.0, 3)).toBe(3.33); // 10.00 / 3 = 3.3333... -> 3.33
      expect(divideMoney(100.0, 7)).toBe(14.29); // 100.00 / 7 = 14.2857... -> 14.29
    });

    it("should throw error for division by zero", () => {
      expect(() => divideMoney(10.0, 0)).toThrow("Division by zero");
    });

    it("should handle very small results", () => {
      expect(divideMoney(1, 1000)).toBe(0.0);
      expect(divideMoney(1, 100)).toBe(0.01);
    });
  });

  describe("calculatePercentage", () => {
    it("should calculate percentages correctly", () => {
      expect(calculatePercentage(1000, 0.05)).toBe(50.0); // 5% of 1000
      expect(calculatePercentage(2000, 0.025)).toBe(50.0); // 2.5% of 2000
      expect(calculatePercentage(1234.56, 0.15)).toBe(185.18); // 15% of 1234.56
    });
  });

  describe("calculateCompoundInterest", () => {
    it("should calculate compound interest correctly", () => {
      // $1000 at 5% for 1 period: 1000 * (1.05)^1 - 1000 = 50.00
      expect(calculateCompoundInterest(1000, 0.05, 1)).toBe(50.0);

      // $1000 at 5% for 2 periods: 1000 * (1.05)^2 - 1000 = 102.50
      expect(calculateCompoundInterest(1000, 0.05, 2)).toBe(102.5);
    });

    it("should handle fractional periods", () => {
      // Daily compounding example
      const dailyRate = 0.05 / 365; // 5% annual rate
      const result = calculateCompoundInterest(1000, dailyRate, 30); // 30 days
      expect(result).toBeCloseTo(4.11, 1); // Should be around $4.11
    });
  });

  describe("calculateSimpleInterest", () => {
    it("should calculate simple interest correctly", () => {
      // $1000 at 5% for 1 year: 1000 * 0.05 * 1 = 50.00
      expect(calculateSimpleInterest(1000, 0.05, 1)).toBe(50.0);

      // $1000 at 5% for 2 years: 1000 * 0.05 * 2 = 100.00
      expect(calculateSimpleInterest(1000, 0.05, 2)).toBe(100.0);
    });

    it("should handle fractional time periods", () => {
      // 6 months at 10% annual rate
      expect(calculateSimpleInterest(1000, 0.1, 0.5)).toBe(50.0);
    });
  });

  describe("formatMoney", () => {
    it("should format monetary values to 2 decimal places", () => {
      expect(formatMoney(10)).toBe("10.00");
      expect(formatMoney(10.1)).toBe("10.10");
      expect(formatMoney(10.125)).toBe("10.12"); // Rounded using bankers rounding
      expect(formatMoney(10.135)).toBe("10.14"); // Rounded using bankers rounding
    });

    it("should handle negative values", () => {
      expect(formatMoney(-10.125)).toBe("-10.12");
      expect(formatMoney(-0.01)).toBe("-0.01");
    });
  });

  describe("isValidMonetaryValue", () => {
    it("should validate monetary values correctly", () => {
      expect(isValidMonetaryValue(10.5)).toBe(true);
      expect(isValidMonetaryValue("10.50")).toBe(true);
      expect(isValidMonetaryValue(new Prisma.Decimal("10.50"))).toBe(true);
      expect(isValidMonetaryValue(0)).toBe(true);
      expect(isValidMonetaryValue(-10.5)).toBe(true);
    });

    it("should reject invalid values", () => {
      expect(isValidMonetaryValue(null)).toBe(false);
      expect(isValidMonetaryValue(undefined)).toBe(false);
      expect(isValidMonetaryValue("invalid")).toBe(false);
      expect(isValidMonetaryValue(NaN)).toBe(false);
      expect(isValidMonetaryValue(Infinity)).toBe(false);
    });
  });

  describe("normalizeMonetaryValue", () => {
    it("should normalize valid values", () => {
      expect(normalizeMonetaryValue(10.125)).toBe(10.12);
      expect(normalizeMonetaryValue("10.125")).toBe(10.12);
      expect(normalizeMonetaryValue(new Prisma.Decimal("10.125"))).toBe(10.12);
    });

    it("should throw error for invalid values", () => {
      expect(() => normalizeMonetaryValue("invalid")).toThrow(
        "Invalid monetary value"
      );
      expect(() => normalizeMonetaryValue(NaN)).toThrow(
        "Invalid monetary value"
      );
    });
  });

  describe("isMonetaryEqual", () => {
    it("should compare monetary values correctly", () => {
      expect(isMonetaryEqual(10.125, 10.12)).toBe(true); // Both round to 10.12
      expect(isMonetaryEqual(10.124, 10.124)).toBe(true); // Both are the same
      expect(isMonetaryEqual(10.12, 10.13)).toBe(false);
      expect(isMonetaryEqual("10.125", 10.12)).toBe(true);
    });
  });

  describe("absoluteMoney", () => {
    it("should return absolute values", () => {
      expect(absoluteMoney(-10.125)).toBe(10.12);
      expect(absoluteMoney(10.125)).toBe(10.12);
      expect(absoluteMoney(0)).toBe(0.0);
    });
  });

  describe("maxMoney and minMoney", () => {
    it("should return maximum correctly", () => {
      expect(maxMoney(10.125, 10.135)).toBe(10.14); // max(10.12, 10.14) = 10.14
      expect(maxMoney(-5.0, -10.0)).toBe(-5.0);
    });

    it("should return minimum correctly", () => {
      expect(minMoney(10.125, 10.135)).toBe(10.12); // min(10.12, 10.14) = 10.12
      expect(minMoney(-5.0, -10.0)).toBe(-10.0);
    });
  });

  describe("sumMoney", () => {
    it("should sum arrays of monetary values", () => {
      expect(sumMoney([10.125, 5.125, 2.5])).toBe(17.75);
      expect(sumMoney(["10.00", "5.50", "2.25"])).toBe(17.75);
      expect(sumMoney([])).toBe(0.0);
    });

    it("should handle mixed types", () => {
      expect(sumMoney([10.125, "5.125", new Prisma.Decimal("2.50")])).toBe(17.75);
    });
  });

  describe("Real-world financial scenarios", () => {
    it("should handle interest calculations accurately", () => {
      // Calculate monthly interest on a credit card balance
      const balance = 1234.56;
      const monthlyRate = 0.18 / 12; // 18% APR / 12 months
      const monthlyInterest = calculatePercentage(balance, monthlyRate);

      expect(monthlyInterest).toBe(18.52); // Should be exactly $18.52
    });

    it("should handle payment calculations", () => {
      // Calculate minimum payment (higher of $25 or 2% of balance)
      const balance = 1000.0;
      const percentagePayment = calculatePercentage(balance, 0.02); // 2%
      const minPayment = maxMoney(25.0, percentagePayment);

      expect(minPayment).toBe(25.0); // $25 is higher than $20 (2% of $1000)
    });

    it("should handle compound interest for savings", () => {
      // Daily compounding savings account
      const principal = 10000.0;
      const annualRate = 0.05; // 5% APR
      const dailyRate = annualRate / 365;
      const interestFor30Days = calculateCompoundInterest(
        principal,
        dailyRate,
        30
      );

      expect(interestFor30Days).toBeCloseTo(41.18, 1); // Should be around $41.18 (adjusted)
    });
  });
});
