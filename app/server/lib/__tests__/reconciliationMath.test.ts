import { describe, it, expect } from "vitest";
import {
  amountsMatch,
  reconciliationClearedBalance,
  reconciliationDifference,
  toAmountCents,
} from "../reconciliationMath";

describe("reconciliationMath", () => {
  describe("reconciliationClearedBalance", () => {
    it("adds the cleared amount sum to the statement opening balance", () => {
      expect(reconciliationClearedBalance(1000, 250.5)).toBe(1250.5);
    });

    it("rounds away float drift (0.1 + 0.2)", () => {
      expect(reconciliationClearedBalance(0.1, 0.2)).toBe(0.3);
    });

    it("handles negative cleared sums", () => {
      expect(reconciliationClearedBalance(100, -30.25)).toBe(69.75);
    });
  });

  describe("reconciliationDifference", () => {
    it("is zero when the ledger cleared balance matches the statement ending balance", () => {
      expect(reconciliationDifference(1250.5, 1000, 250.5)).toBe(0);
    });

    it("is positive when the statement ends above the ledger cleared balance", () => {
      expect(reconciliationDifference(1100, 1000, 50)).toBe(50);
    });

    it("is negative when the statement ends below the ledger cleared balance", () => {
      expect(reconciliationDifference(950, 1000, 0)).toBe(-50);
      expect(reconciliationDifference(950, 1000, 100)).toBe(-150);
    });

    it("rounds the result to cents", () => {
      expect(reconciliationDifference(100.1, 0, 0.2)).toBeCloseTo(99.9, 10);
    });
  });

  describe("amountsMatch", () => {
    it("matches identical amounts", () => {
      expect(amountsMatch(12.34, 12.34)).toBe(true);
    });

    it("matches within the default one-cent tolerance", () => {
      expect(amountsMatch(12.34, 12.35)).toBe(true);
    });

    it("does not match beyond the default tolerance", () => {
      expect(amountsMatch(12.34, 12.36)).toBe(false);
    });

    it("honors a custom tolerance in cents", () => {
      expect(amountsMatch(12.34, 12.38, 6)).toBe(true);
      expect(amountsMatch(12.34, 12.38, 3)).toBe(false);
    });

    it("rounds both sides before comparing", () => {
      expect(amountsMatch(0.1 + 0.2, 0.3)).toBe(true);
    });

    it("treats sign differences as mismatches", () => {
      expect(amountsMatch(-25, 25)).toBe(false);
    });
  });

  describe("toAmountCents", () => {
    it("converts a dollar amount to whole cents", () => {
      expect(toAmountCents(12.34)).toBe(1234);
    });

    it("rounds to cents before converting", () => {
      expect(toAmountCents(0.1 + 0.2)).toBe(30);
    });

    it("handles negative amounts", () => {
      expect(toAmountCents(-9.99)).toBe(-999);
    });

    it("handles zero", () => {
      expect(toAmountCents(0)).toBe(0);
    });
  });
});
