import { z } from "zod";
import { getUser } from "~/server/lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { getReconciliationPeriodWorkspace } from "~/server/services/reconciliationService";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export default defineEventHandler(async (event) => {
  try {
    const { userId } = getUser(event);
    const params = paramsSchema.parse(event.context.params ?? {});
    return await getReconciliationPeriodWorkspace({
      userId,
      periodId: params.id,
    });
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
