import { describe, expect, it } from "vitest";
import {
  collectNormalizedPlaidDescriptionAliases,
  normalizePlaidDescription,
} from "../normalizePlaidDescription";

describe("normalizePlaidDescription", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalizePlaidDescription("  STARBUCKS   Store #123  ")).toBe(
      "starbucks store #123",
    );
    expect(normalizePlaidDescription("A\tB\nC")).toBe("a b c");
  });

  it("truncates to 500 characters", () => {
    const long = "a".repeat(600);
    expect(normalizePlaidDescription(long)).toHaveLength(500);
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizePlaidDescription("   ")).toBe("");
  });
});

describe("collectNormalizedPlaidDescriptionAliases", () => {
  it("collects unique normalized aliases from the known name fields", () => {
    const aliases = collectNormalizedPlaidDescriptionAliases({
      name: "Uber   Trip",
      merchant_name: "UBER",
      original_description: "uber trip help.uber.com",
    });

    expect(aliases).toEqual([
      "uber trip",
      "uber",
      "uber trip help.uber.com",
    ]);
  });

  it("dedupes case-insensitively after normalization", () => {
    const aliases = collectNormalizedPlaidDescriptionAliases({
      name: "SHELL OIL",
      merchant_name: "shell oil",
      original_description: "  SHELL  oil ",
    });

    expect(aliases).toEqual(["shell oil"]);
  });

  it("ignores non-string and missing fields", () => {
    expect(
      collectNormalizedPlaidDescriptionAliases({
        name: 42,
        merchant_name: null,
      }),
    ).toEqual([]);
    expect(collectNormalizedPlaidDescriptionAliases(null)).toEqual([]);
    expect(collectNormalizedPlaidDescriptionAliases(undefined)).toEqual([]);
    expect(collectNormalizedPlaidDescriptionAliases("not an object")).toEqual(
      [],
    );
  });
});
