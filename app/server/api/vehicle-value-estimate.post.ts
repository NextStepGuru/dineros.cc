import { readBody } from "h3";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { vehicleValueEstimateRequestSchema } from "~/schema/zod";
import { estimateVehicleValue } from "~/server/services/VehicleValueEstimateService";

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { userId } = getUser(event);
    const input = vehicleValueEstimateRequestSchema.parse(body);
    const estimate = await estimateVehicleValue({ userId, input });
    return { estimate };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
