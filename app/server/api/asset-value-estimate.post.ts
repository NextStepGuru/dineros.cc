import { readBody } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { assetValueEstimateRequestSchema } from "~/schema/zod";
import { estimateAssetValue } from "~/server/services/AssetValueEstimateService";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);
    const input = assetValueEstimateRequestSchema.parse(body);
    const estimate = await estimateAssetValue({ userId, input });
    return { estimate };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
