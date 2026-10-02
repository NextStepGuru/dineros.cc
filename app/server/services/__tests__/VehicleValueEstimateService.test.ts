import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateVehicleValue } from "../VehicleValueEstimateService";

vi.mock("~/server/services/AssetValueEstimateService", () => ({
  estimateAssetValue: vi.fn(),
}));

describe("estimateVehicleValue", () => {
  let estimateAssetValue: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ estimateAssetValue } = await import(
      "~/server/services/AssetValueEstimateService"
    ));
    estimateAssetValue.mockResolvedValue({
      estimatedValueMid: 12000,
      estimatedValueLow: 10500,
      estimatedValueHigh: 13500,
      currency: "USD",
      rationale: "ok",
      disclaimer: "d",
    });
  });

  it("delegates to estimateAssetValue with category vehicle injected", async () => {
    const input = {
      accountId: "acct-1",
      year: 2020,
      make: "Toyota",
      model: "Camry",
      mileage: 30000,
      condition: "good" as const,
    };
    const sentinel = {
      estimatedValueMid: 12000,
      estimatedValueLow: 10500,
      estimatedValueHigh: 13500,
      currency: "USD",
      rationale: "ok",
      disclaimer: "d",
    };

    const result = await estimateVehicleValue({ userId: 5, input });

    expect(estimateAssetValue).toHaveBeenCalledTimes(1);
    expect(estimateAssetValue).toHaveBeenCalledWith({
      userId: 5,
      input: { category: "vehicle", ...input },
    });
    expect(result).toEqual(sentinel);
  });

  it("passes optional vehicle fields through unchanged", async () => {
    const input = {
      accountId: "acct-1",
      accountRegisterId: 42,
      year: 2015,
      make: "Honda",
      model: "Civic",
      trim: "EX",
      mileage: 90000,
      condition: "fair" as const,
      zip: "12345",
      purchasePriceHint: 18000,
      vinLast4: "9A3Z",
    };

    await estimateVehicleValue({ userId: 9, input });

    expect(estimateAssetValue).toHaveBeenCalledWith({
      userId: 9,
      input: { category: "vehicle", ...input },
    });
  });
});
