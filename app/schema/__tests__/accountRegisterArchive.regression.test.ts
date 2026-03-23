import { describe, it, expect } from "vitest";
import { accountRegisterSchema } from "../zod";

/** Regression: P2003 on statement_interval_id when UI sent 0 or null — must coerce to valid interval.id */
const base = {
  id: 1,
  accountId: "acc-1",
  typeId: 1,
  budgetId: 1,
  name: "Test Account",
  balance: 0,
  latestBalance: 0,
  minPayment: null,
  statementAt: new Date(),
  apr1: null,
  apr1StartAt: null,
  apr2: null,
  apr2StartAt: null,
  apr3: null,
  apr3StartAt: null,
  targetAccountRegisterId: null,
  collateralAssetRegisterId: null,
  loanStartAt: null,
  loanPaymentsPerYear: null,
  loanTotalYears: null,
  loanOriginalAmount: null,
  sortOrder: 0,
  loanPaymentSortOrder: 0,
  savingsGoalSortOrder: 0,
  accountSavingsGoal: null,
  minAccountBalance: 0,
  allowExtraPayment: false,
  isArchived: false,
  depreciationRate: null,
  depreciationMethod: null,
  assetOriginalValue: null,
  assetResidualValue: null,
  assetUsefulLifeYears: null,
  assetStartAt: null,
};

describe("accountRegisterSchema statementIntervalId (FK regression)", () => {
  it("coerces 0 to default 3", () => {
    const out = accountRegisterSchema.parse({
      ...base,
      statementIntervalId: 0,
    });
    expect(out.statementIntervalId).toBe(3);
  });

  it("coerces null to default 3", () => {
    const out = accountRegisterSchema.parse({
      ...base,
      statementIntervalId: null,
    });
    expect(out.statementIntervalId).toBe(3);
  });

  it("coerces empty string to default 3", () => {
    const out = accountRegisterSchema.parse({
      ...base,
      statementIntervalId: "" as unknown as number,
    });
    expect(out.statementIntervalId).toBe(3);
  });

  it("coerces non-finite values to default 3", () => {
    const out = accountRegisterSchema.parse({
      ...base,
      statementIntervalId: Number.NaN as unknown as number,
    });
    expect(out.statementIntervalId).toBe(3);
  });

  it("preserves valid interval ids", () => {
    expect(
      accountRegisterSchema.parse({ ...base, statementIntervalId: 1 })
        .statementIntervalId,
    ).toBe(1);
    expect(
      accountRegisterSchema.parse({ ...base, statementIntervalId: 6 })
        .statementIntervalId,
    ).toBe(6);
  });
});
