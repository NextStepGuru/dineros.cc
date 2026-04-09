import type { z } from "zod";
import type { vehicleValueEstimateRequestSchema, vehicleValueEstimateAiResultSchema  } from "~/schema/zod";
import { estimateAssetValue } from "~/server/services/AssetValueEstimateService";

export type VehicleValueEstimateInput = z.infer<
  typeof vehicleValueEstimateRequestSchema
>;

export async function estimateVehicleValue(params: {
  userId: number;
  input: VehicleValueEstimateInput;
}): Promise<z.infer<typeof vehicleValueEstimateAiResultSchema>> {
  const { userId, input } = params;
  return estimateAssetValue({
    userId,
    input: { category: "vehicle", ...input },
  });
}
