import { describe, it, expect } from "vitest";
import { reoccurrenceWithSplitsSchema } from "../zod";

const base = {
  id: 0,
  accountId: "account-id-1",
  accountRegisterId: 1,
  intervalId: 1,
  transferAccountRegisterId: undefined as number | undefined,
  adjustBeforeIfOnWeekend: false,
  description: "Monthly subscription",
  amount: 42.5,
  lastAt: "2024-06-15T00:00:00.000Z",
  endAt: null as null | undefined,
  splits: [] as [],
};

describe("reoccurrenceWithSplitsSchema (POST body)", () => {
  it("parses a minimal create payload with defaults", () => {
    const out = reoccurrenceWithSplitsSchema.parse(base);
    expect(out.amountAdjustmentMode).toBe("NONE");
    expect(out.splits).toEqual([]);
  });

  it("rejects non-NONE adjustment without direction", () => {
    const r = reoccurrenceWithSplitsSchema.safeParse({
      ...base,
      amountAdjustmentMode: "PERCENT",
      amountAdjustmentValue: 5,
      amountAdjustmentIntervalId: 1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.includes("amountAdjustmentDirection")),
      ).toBe(true);
    }
  });

  it("accepts a full adjustment payload", () => {
    const out = reoccurrenceWithSplitsSchema.parse({
      ...base,
      amountAdjustmentMode: "FIXED",
      amountAdjustmentDirection: "INCREASE",
      amountAdjustmentValue: 10,
      amountAdjustmentIntervalId: 2,
      amountAdjustmentIntervalCount: 1,
      amountAdjustmentAnchorAt: "2024-01-01",
    });
    expect(out.amountAdjustmentMode).toBe("FIXED");
    expect(out.amountAdjustmentDirection).toBe("INCREASE");
  });
});
