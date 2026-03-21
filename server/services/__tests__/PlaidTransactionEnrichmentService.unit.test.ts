import { describe, it, expect } from "vitest";
import type { Category } from "@prisma/client";
import type { Transaction } from "plaid";
import {
  buildCategoryPaths,
  transactionDisplayLabel,
} from "../PlaidTransactionEnrichmentService";

describe("transactionDisplayLabel", () => {
  it("prefers merchant_name over original_description", () => {
    const tx = {
      merchant_name: "  Cafe  ",
      original_description: "POS PURCHASE",
    } as Transaction;
    expect(transactionDisplayLabel(tx)).toBe("Cafe");
  });

  it("falls back to original_description", () => {
    const tx = {
      merchant_name: null,
      original_description: " ACH DEBIT ",
    } as unknown as Transaction;
    expect(transactionDisplayLabel(tx)).toBe("ACH DEBIT");
  });

  it("returns empty string when no label fields", () => {
    const tx = {} as Transaction;
    expect(transactionDisplayLabel(tx)).toBe("");
  });
});

describe("buildCategoryPaths", () => {
  it("joins parent / child names for nested categories", () => {
    const categories = [
      {
        id: "root-id",
        name: "Food",
        subCategoryId: null,
      },
      {
        id: "leaf-id",
        name: "Groceries",
        subCategoryId: "root-id",
      },
    ] as Category[];
    const paths = buildCategoryPaths(categories);
    expect(paths.get("root-id")).toBe("Food");
    expect(paths.get("leaf-id")).toBe("Food / Groceries");
  });
});
