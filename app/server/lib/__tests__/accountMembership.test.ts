import { describe, expect, it } from "vitest";
import {
  accountRegisterVisibleForMembership,
  budgetAllowedForMembership,
  parseAllowedAccountRegisterIds,
  parseAllowedBudgetIds,
} from "~/server/lib/accountMembership";

describe("parseAllowedBudgetIds", () => {
  it("null/undefined means all (null)", () => {
    expect(parseAllowedBudgetIds(null)).toBeNull();
    expect(parseAllowedBudgetIds(undefined)).toBeNull();
  });

  it("non-array returns null", () => {
    expect(parseAllowedBudgetIds("1")).toBeNull();
  });

  it("filters to positive integers and sorts unique", () => {
    expect(parseAllowedBudgetIds([2, 1, 2, 0, -1, 1.5, "4"])).toEqual([1, 2, 4]);
  });

  it("empty array after filter becomes empty list", () => {
    expect(parseAllowedBudgetIds([])).toEqual([]);
  });
});

describe("parseAllowedAccountRegisterIds", () => {
  it("null means all registers (null)", () => {
    expect(parseAllowedAccountRegisterIds(null)).toBeNull();
  });

  it("empty array means none", () => {
    expect(parseAllowedAccountRegisterIds([])).toEqual([]);
  });

  it("coerces string numbers and sorts unique", () => {
    expect(parseAllowedAccountRegisterIds([3, "3", 1])).toEqual([1, 3]);
  });
});

describe("budgetAllowedForMembership", () => {
  const m = { canViewBudgets: true, allowedBudgetIds: null as unknown };

  it("false when canViewBudgets false", () => {
    expect(
      budgetAllowedForMembership({ ...m, canViewBudgets: false }, 1),
    ).toBe(false);
  });

  it("true when allowed list is null", () => {
    expect(budgetAllowedForMembership(m, 99)).toBe(true);
  });

  it("true only when budget id in allowed list", () => {
    expect(
      budgetAllowedForMembership(
        { canViewBudgets: true, allowedBudgetIds: [1, 2] },
        2,
      ),
    ).toBe(true);
    expect(
      budgetAllowedForMembership(
        { canViewBudgets: true, allowedBudgetIds: [1] },
        3,
      ),
    ).toBe(false);
  });
});

describe("accountRegisterVisibleForMembership", () => {
  const base = {
    canViewBudgets: true,
    allowedBudgetIds: null,
    allowedAccountRegisterIds: null,
  };

  it("false when budget not allowed", () => {
    expect(
      accountRegisterVisibleForMembership(
        {
          ...base,
          allowedBudgetIds: [1],
        },
        { id: 10, budgetId: 2, accountId: "a" },
      ),
    ).toBe(false);
  });

  it("false when register id not in allowed list", () => {
    expect(
      accountRegisterVisibleForMembership(
        {
          ...base,
          allowedAccountRegisterIds: [1, 2],
        },
        { id: 10, budgetId: 1, accountId: "a" },
      ),
    ).toBe(false);
  });

  it("true when budget and register allowed", () => {
    expect(
      accountRegisterVisibleForMembership(
        {
          ...base,
          allowedBudgetIds: [1],
          allowedAccountRegisterIds: [10],
        },
        { id: 10, budgetId: 1, accountId: "a" },
      ),
    ).toBe(true);
  });
});
