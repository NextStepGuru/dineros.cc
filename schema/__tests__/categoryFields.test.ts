import { describe, it, expect } from "vitest";
import {
  accountRegisterSchema,
  reoccurrenceSplitSchema,
} from "../zod";

const minimalAccountRegister = {
  id: 1,
  accountId: "acc-1",
  typeId: 1,
  budgetId: 1,
  name: "Test Account",
  balance: 0,
  latestBalance: 0,
  minPayment: null,
  statementAt: new Date(),
  statementIntervalId: null,
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

describe("accountRegisterSchema category fields", () => {
  it("accepts null payment and interest category ids", () => {
    const out = accountRegisterSchema.parse({
      ...minimalAccountRegister,
      paymentCategoryId: null,
      interestCategoryId: null,
    });
    expect(out.paymentCategoryId).toBeNull();
    expect(out.interestCategoryId).toBeNull();
  });

  it("accepts uuid payment and interest category ids", () => {
    const pid = "550e8400-e29b-41d4-a716-446655440001";
    const iid = "550e8400-e29b-41d4-a716-446655440002";
    const out = accountRegisterSchema.parse({
      ...minimalAccountRegister,
      paymentCategoryId: pid,
      interestCategoryId: iid,
    });
    expect(out.paymentCategoryId).toBe(pid);
    expect(out.interestCategoryId).toBe(iid);
  });
});

describe("reoccurrenceSplitSchema categoryId", () => {
  it("accepts null or valid uuid", () => {
    const base = {
      transferAccountRegisterId: 2,
      amount: 10,
      sortOrder: 0,
    };
    expect(
      reoccurrenceSplitSchema.parse({ ...base, categoryId: null }).categoryId,
    ).toBeNull();
    const id = "550e8400-e29b-41d4-a716-446655440003";
    expect(
      reoccurrenceSplitSchema.parse({ ...base, categoryId: id }).categoryId,
    ).toBe(id);
  });

  it("rejects invalid category uuid string", () => {
    const result = reoccurrenceSplitSchema.safeParse({
      transferAccountRegisterId: 2,
      amount: 10,
      categoryId: "not-a-uuid",
      sortOrder: 0,
    });
    expect(result.success).toBe(false);
  });
});
