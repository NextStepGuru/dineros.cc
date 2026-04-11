import { describe, expect, it } from "vitest";
import {
  matchesTableGlobalFilter,
  normalizeQuery,
  queryTokens,
} from "../tableGlobalFilterMatch";

describe("tableGlobalFilterMatch", () => {
  it("empty query matches", () => {
    expect(matchesTableGlobalFilter("", ["foo"])).toBe(true);
    expect(matchesTableGlobalFilter("   ", ["foo"])).toBe(true);
  });

  it("single token substring on combined haystack", () => {
    expect(
      matchesTableGlobalFilter("payment", [
        "Debt Payment to RV Loan",
        "x",
      ]),
    ).toBe(true);
    expect(matchesTableGlobalFilter("nomatch", ["Debt Payment to RV Loan"])).toBe(
      false,
    );
  });

  it("multi-token AND: debt rv matches description", () => {
    expect(
      matchesTableGlobalFilter("debt rv", ["Debt Payment to RV Loan"]),
    ).toBe(true);
  });

  it("multi-token non-match when token missing", () => {
    expect(
      matchesTableGlobalFilter("debt xyz", ["Debt Payment to RV Loan"]),
    ).toBe(false);
  });

  it("token order independence", () => {
    expect(
      matchesTableGlobalFilter("rv debt", ["Debt Payment to RV Loan"]),
    ).toBe(true);
  });
});

describe("normalizeQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeQuery("  a   b  ")).toBe("a b");
  });
});

describe("queryTokens", () => {
  it("splits on whitespace", () => {
    expect(queryTokens("debt rv")).toEqual(["debt", "rv"]);
  });
});
